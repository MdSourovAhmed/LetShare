

/**
 * useSender — v2.3
 * Adds telemetry collection via useTelemetry.
 * All telemetry hooks fire OUTSIDE the hot chunk loop — zero throughput impact.
 */
import { useState, useRef, useCallback } from 'react'
import  createSocket           from '../lib/socket'
import { generateId, getFilePath } from '@letshare/core/lib/utils'
import { getTransferProfile }    from '@letshare/core/lib/webrtc'
import { RTC_CONFIG }            from '../lib/rtcConfig'
import { createTransferEngine }  from '@letshare/core/lib/transferEngine'
import { useThrottledProgress }  from '@letshare/core/hooks/useThrottledProgress'
import { useTelemetry }          from '@letshare/core/lib/useTelemetry'

const PROFILE = getTransferProfile('internet')

const makeFileList = (files) => files.map((f) => ({
  path:   getFilePath(f),
  name:   f.name,
  size:   f.size,
  type:   f.type || 'application/octet-stream',
  status: 'pending',
}))

const initialState = {
  phase:        'idle',
  linkId:       null,
  shareLink:    null,
  statusText:   'Ready to share',
  receivers:    [],
  fileList:     [],
  totalSize:    0,
  selectionMode: null,
}

export function useSender() {
  const [state,         setState]         = useState(initialState)
  const [selectedFiles, setSelectedFiles] = useState([])

  const socketRef     = useRef(null)
  const peersRef      = useRef(new Map())
  const filesRef      = useRef([])
  const speedTrackRef = useRef(new Map())

  const { throttledUpdate, flushNow } = useThrottledProgress(100)
  const telemetry = useTelemetry({ mode: 'internet', role: 'sender' })

  const patch = useCallback(
    (partial) => setState((s) => ({ ...s, ...partial })),
    []
  )

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFilesSelected = useCallback((files, mode = 'files') => {
    const arr = Array.from(files)
    filesRef.current = arr
    setSelectedFiles(arr)
    const totalSize = arr.reduce((s, f) => s + f.size, 0)
    patch({ fileList: makeFileList(arr), totalSize, selectionMode: mode })
  }, [patch])

  // ── Remove file (idle phase only) ──────────────────────────────────────────
  const removeFile = useCallback((fileIndex) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== fileIndex)
      filesRef.current = next
      const totalSize = next.reduce((s, f) => s + f.size, 0)
      patch({ fileList: makeFileList(next), totalSize })
      return next
    })
  }, [patch])

  // ── Create session ─────────────────────────────────────────────────────────
  const createSession = useCallback(() => {
    if (!selectedFiles.length) return

    telemetry.onSessionCreate()

    const linkId    = generateId()
    const shareLink = `${window.location.origin}/receive?id=${linkId}`
    patch({ phase: 'waiting', linkId, shareLink, statusText: 'Waiting for receivers…', receivers: [] })

    const socket = createSocket()
    socketRef.current = socket

    socket.on('connect_error', () =>
      patch({ phase: 'idle', statusText: 'Could not reach signaling server.' }))

    socket.on('peer-joined', ({ socketId, role }) => {
      if (role !== 'receiver') return
      addReceiver(socket, linkId, socketId)
    })

    socket.on('signal', async ({ fromSocketId, payload }) => {
      const peer = peersRef.current.get(fromSocketId)
      if (!peer) return
      try {
        if (payload.type === 'answer') await peer.pc.setRemoteDescription(payload.sdp)
        else if (payload.type === 'ice') await peer.pc.addIceCandidate(payload.candidate)
      } catch (e) { console.error('signal', e) }
    })

    socket.emit('join', { linkId, role: 'sender' })
  }, [selectedFiles, patch, telemetry])

  // ── Add one receiver ───────────────────────────────────────────────────────
  function addReceiver(socket, linkId, socketId) {
    const label = `Receiver ${peersRef.current.size + 1}`

    setState((s) => ({
      ...s,
      phase: 'active',
      statusText: 'Receivers connected',
      receivers: [...s.receivers, {
        socketId, label,
        phase: 'connecting',
        fileProgress: filesRef.current.map(() => 0),
        totalSent: 0, speedBps: 0,
        speedHistory: [], startedAt: null, finishedAt: null, error: null,
      }],
    }))

    speedTrackRef.current.set(socketId, { lastBytes: 0, lastTime: Date.now(), history: [] })

    const pc = new RTCPeerConnection(RTC_CONFIG)
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('signal', { linkId, toSocketId: socketId,
          payload: { type: 'ice', candidate: e.candidate } })
    }

    const dc = pc.createDataChannel('file', { ordered: true })
    dc.binaryType = 'arraybuffer'
    dc.onopen  = () => {
      telemetry.onChannelOpen(pc)   // records connection setup time, holds pc for getStats()
      patchReceiver(socketId, { phase: 'transferring', startedAt: Date.now() })
      runTransfer(socketId, dc)
    }
    dc.onclose = () => patchReceiver(socketId, { phase: 'error', error: 'Connection closed' })
    dc.onerror = () => patchReceiver(socketId, { phase: 'error', error: 'Connection error' })

    peersRef.current.set(socketId, { pc, dc, engine: null })

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => socket.emit('signal', { linkId, toSocketId: socketId,
          payload: { type: 'offer', sdp: pc.localDescription } }))
      .catch((e) => patchReceiver(socketId, { phase: 'error', error: e.message }))
  }

  // ── Transfer loop ──────────────────────────────────────────────────────────
  function runTransfer(socketId, dc) {
    const files       = filesRef.current
    const perFileSent = files.map(() => 0)

    const engine = createTransferEngine(dc, files, PROFILE, {
      getFileMeta: (f) => ({
        path: getFilePath(f), name: f.name,
        size: f.size, type: f.type || 'application/octet-stream',
      }),

      // ── Telemetry hooks (outside hot path) ──────────────────────────────
      onPauseStart: telemetry.onPauseStart,
      onPauseEnd:   telemetry.onPauseEnd,

      onFileStart: (index) => {
        telemetry.onFileStart(index, files[index]?.size ?? 0)
        setState((s) => ({
          ...s,
          fileList: s.fileList.map((f, i) => i === index ? { ...f, status: 'sending' } : f),
        }))
      },

      // ── Hot path ─────────────────────────────────────────────────────────
      onChunkSent: (index, offsetInFile, fileSize) => {
        telemetry.onChunk()   // just increments a ref counter — nanoseconds

        perFileSent[index] = offsetInFile
        const totalSent = perFileSent.reduce((s, x) => s + x, 0)
        const fp        = fileSize ? Math.floor((offsetInFile / fileSize) * 100) : 100

        const track   = speedTrackRef.current.get(socketId)
        const now     = Date.now()
        const elapsed = (now - track.lastTime) / 1000
        let speedBps  = null
        if (elapsed >= 0.25) {
          speedBps = Math.round((totalSent - track.lastBytes) / elapsed)
          track.lastBytes = totalSent
          track.lastTime  = now
          track.history   = [...(track.history || []), speedBps].slice(-100)
          speedTrackRef.current.set(socketId, track)
        }

        throttledUpdate(() => {
          setState((s) => ({
            ...s,
            receivers: s.receivers.map((r) => {
              if (r.socketId !== socketId) return r
              const fp2  = [...r.fileProgress]; fp2[index] = fp
              const hist = speedBps !== null ? [...r.speedHistory, speedBps].slice(-20) : r.speedHistory
              return { ...r, fileProgress: fp2, totalSent, speedBps: speedBps ?? r.speedBps, speedHistory: hist }
            }),
          }))
        })
      },
      // ── End hot path ─────────────────────────────────────────────────────

      onFileEnd: (index) => {
        telemetry.onFileEnd(index)
        flushNow()
        setState((s) => ({
          ...s,
          fileList: s.fileList.map((f, i) => i === index ? { ...f, status: 'done' } : f),
        }))
      },

      onFileSkipped: (index) => {
        perFileSent[index] = 0; flushNow()
        setState((s) => ({
          ...s,
          fileList: s.fileList.map((f, i) => i === index ? { ...f, status: 'skipped' } : f),
        }))
      },

      onCancelled: () => patchReceiver(socketId, { phase: 'error', error: 'Cancelled.' }),
    })

    const peer = peersRef.current.get(socketId)
    if (peer) peer.engine = engine

    engine.run()
      .then(async () => {
        engine.cleanup()
        flushNow()
        patchReceiver(socketId, { phase: 'done', speedBps: 0, finishedAt: Date.now() })

        // ── Telemetry finalise — runs AFTER transfer completes ──────────────
        const track     = speedTrackRef.current.get(socketId)
        const totalSent = perFileSent.reduce((s, x) => s + x, 0)
        await telemetry.finalise({
          totalBytes:   totalSent,
          peakSpeedBps: track?.history?.length ? Math.max(...track.history) : 0,
          speedSamples: track?.history || [],
          fileList:     state.fileList,
          outcome:      'done',
        })

        setState((s) => {
          const allDone = s.receivers.every((r) =>
            r.socketId === socketId ? true : r.phase === 'done')
          return allDone ? { ...s, phase: 'done', statusText: 'All receivers done!' } : s
        })
      })
      .catch((e) => {
        engine.cleanup()
        if (!e.message.includes('cancelled'))
          patchReceiver(socketId, { phase: 'error', error: e.message })
      })
  }

  // ── Skip / cancel ──────────────────────────────────────────────────────────
  const skipFile = useCallback((fileIndex) => {
    peersRef.current.forEach(({ engine }) => { engine?.skipFile(fileIndex) })
    setState((s) => ({
      ...s,
      fileList: s.fileList.map((f, i) =>
        i === fileIndex && f.status !== 'done' ? { ...f, status: 'skipped' } : f
      ),
    }))
  }, [])

  const cancelReceiver = useCallback((socketId) => {
    const peer = peersRef.current.get(socketId)
    if (peer?.engine) peer.engine.cancel()
    patchReceiver(socketId, { phase: 'error', error: 'Cancelled by sender.' })
  }, [])

  function patchReceiver(socketId, partial) {
    setState((s) => ({
      ...s,
      receivers: s.receivers.map((r) => r.socketId === socketId ? { ...r, ...partial } : r),
    }))
  }

  const copyLink = useCallback(async () => {
    if (!state.shareLink) return false
    try { await navigator.clipboard.writeText(state.shareLink); return true }
    catch { return false }
  }, [state.shareLink])

  const reset = useCallback(() => {
    peersRef.current.forEach(({ pc, dc, engine }) => {
      engine?.cleanup(); engine?.cancel()
      try { dc.close() } catch {}
      try { pc.close() } catch {}
    })
    peersRef.current.clear()
    speedTrackRef.current.clear()
    if (socketRef.current) socketRef.current.disconnect()
    socketRef.current = null
    filesRef.current  = []
    setSelectedFiles([])
    setState(initialState)
  }, [])

  return {
    state, selectedFiles,
    handleFilesSelected, removeFile,
    createSession, copyLink,
    skipFile, cancelReceiver, reset,
  }
}
