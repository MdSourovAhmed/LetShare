

/**
 * useShareSession — v2.2
 * Adds skipFile() — same zero-overhead mechanism as Internet useSender.
 * Uses 'lan' transfer profile (256 KB chunks / 4 MB buffer).
 */
import { useState, useRef, useCallback } from 'react'
import { getFilePath }          from '@letshare/core/lib/utils'
import { RTC_CONFIG, getTransferProfile } from '@letshare/core/lib/webrtc'
import { createTransferEngine } from '@letshare/core/lib/transferEngine'
import { useThrottledProgress } from '@letshare/core/hooks/useThrottledProgress'
import { useTelemetry }          from '@letshare/core/lib/useTelemetry'

const PROFILE = getTransferProfile('lan')

const makeFileList = (files) => files.map((f) => ({
  path: getFilePath(f), name: f.name,
  size: f.size, type: f.type || 'application/octet-stream',
  status: 'pending',
}))

export function useShareSession(getSocket) {
  const [sessionId,     setSessionId]     = useState(null)
  const [phase,         setPhase]         = useState('idle')
  const [receivers,     setReceivers]     = useState([])
  const [fileList,      setFileList]      = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [totalSize,     setTotalSize]     = useState(0)
  const [selectionMode, setSelectionMode] = useState('files')

  const peersRef      = useRef(new Map())
  const filesRef      = useRef([])
  const speedTrackRef = useRef(new Map())
  const { throttledUpdate, flushNow } = useThrottledProgress(100)
  const telemetry = useTelemetry({ mode: 'lan', role: 'sender' })

  const handleFilesSelected = useCallback((files, mode = 'files') => {
    const arr = Array.from(files)
    filesRef.current = arr
    setSelectedFiles(arr)
    setTotalSize(arr.reduce((s, f) => s + f.size, 0))
    setSelectionMode(mode)
    setFileList(makeFileList(arr))
  }, [])

  // ── Remove a file before announcing (idle phase only) ───────────────────────
  const removeFile = useCallback((fileIndex) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== fileIndex)
      filesRef.current = next
      setTotalSize(next.reduce((s, f) => s + f.size, 0))
      setFileList(makeFileList(next))
      return next
    })
  }, [])

  const announce = useCallback(({ mode = 'open', pin = null, label } = {}) => {
    const socket = getSocket()
    if (!socket || !filesRef.current.length) return

    const fileCount = filesRef.current.length
    const totalSz   = filesRef.current.reduce((s, f) => s + f.size, 0)
    const autoLabel = label || `${fileCount} file${fileCount !== 1 ? 's' : ''}`

    telemetry.onSessionCreate()
    socket.emit('announce-share', { label: autoLabel, mode, pin, fileCount, totalSize: totalSz })
    socket.once('session-created', ({ sessionId: sid }) => {
      setSessionId(sid); setPhase('active')
    })
    socket.on('peer-joined', ({ socketId, role, name }) => {
      if (role !== 'receiver') return
      addReceiver(socket, socketId, name || `Receiver ${peersRef.current.size + 1}`)
    })
    socket.on('peer-left', ({ socketId }) => {
      setReceivers((prev) => prev.map((r) =>
        r.socketId === socketId ? { ...r, phase: 'error', error: 'Disconnected' } : r
      ))
    })
    socket.on('signal', async ({ fromSocketId, payload }) => {
      const peer = peersRef.current.get(fromSocketId)
      if (!peer) return
      try {
        if (payload.type === 'answer') await peer.pc.setRemoteDescription(payload.sdp)
        else if (payload.type === 'ice') await peer.pc.addIceCandidate(payload.candidate)
      } catch (e) { console.error('signal', e) }
    })
  }, [getSocket])

  function addReceiver(socket, socketId, name) {
    setReceivers((prev) => [...prev, {
      socketId, name, phase: 'connecting',
      fileProgress: filesRef.current.map(() => 0),
      totalSent: 0, speedBps: 0, speedHistory: [],
      startedAt: null, finishedAt: null, error: null,
    }])
    speedTrackRef.current.set(socketId, { lastBytes: 0, lastTime: Date.now() })

    const pc = new RTCPeerConnection(RTC_CONFIG)
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('signal', { toSocketId: socketId, payload: { type: 'ice', candidate: e.candidate } })
    }
    const dc = pc.createDataChannel('file', { ordered: true })
    dc.binaryType = 'arraybuffer'
    dc.onopen  = () => { patchReceiver(socketId, { phase: 'transferring', startedAt: Date.now() }); runTransfer(socketId, dc) }
    dc.onclose = () => patchReceiver(socketId, { phase: 'error', error: 'Connection closed' })
    dc.onerror = () => patchReceiver(socketId, { phase: 'error', error: 'Connection error' })

    peersRef.current.set(socketId, { pc, dc, engine: null })
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => socket.emit('signal', { toSocketId: socketId, payload: { type: 'offer', sdp: pc.localDescription } }))
      .catch((e) => patchReceiver(socketId, { phase: 'error', error: e.message }))
  }

  function runTransfer(socketId, dc) {
    const files       = filesRef.current
    const perFileSent = files.map(() => 0)

    const engine = createTransferEngine(dc, files, PROFILE, {
      getFileMeta: (f) => ({ path: getFilePath(f), name: f.name, size: f.size, type: f.type || 'application/octet-stream' }),

      onFileStart: (index) => {
        setFileList((prev) => prev.map((f, i) => i === index ? { ...f, status: 'sending' } : f))
      },

      onChunkSent: (index, offsetInFile, fileSize) => {
        perFileSent[index] = offsetInFile
        const totalSent = perFileSent.reduce((s, x) => s + x, 0)
        const fp = fileSize ? Math.floor((offsetInFile / fileSize) * 100) : 100
        const track = speedTrackRef.current.get(socketId)
        const now = Date.now(); const elapsed = (now - track.lastTime) / 1000
        let speedBps = null
        if (elapsed >= 0.25) {
          speedBps = Math.round((totalSent - track.lastBytes) / elapsed)
          track.lastBytes = totalSent; track.lastTime = now
          speedTrackRef.current.set(socketId, track)
        }
        telemetry.onChunk()
        throttledUpdate(() => {
          setReceivers((prev) => prev.map((r) => {
            if (r.socketId !== socketId) return r
            const fp2 = [...r.fileProgress]; fp2[index] = fp
            const hist = speedBps !== null ? [...r.speedHistory, speedBps].slice(-20) : r.speedHistory
            return { ...r, fileProgress: fp2, totalSent, speedBps: speedBps ?? r.speedBps, speedHistory: hist }
          }))
        })
      },

      onFileEnd: (index) => {
        flushNow()
        setFileList((prev) => prev.map((f, i) => i === index ? { ...f, status: 'done' } : f))
      },

      onFileSkipped: (index) => {
        perFileSent[index] = 0; flushNow()
        setFileList((prev) => prev.map((f, i) => i === index ? { ...f, status: 'skipped' } : f))
      },

      onCancelled: () => patchReceiver(socketId, { phase: 'error', error: 'Cancelled.' }),
    })

    const peer = peersRef.current.get(socketId)
    if (peer) peer.engine = engine

    engine.run()
      .then(() => { engine.cleanup(); flushNow(); patchReceiver(socketId, { phase: 'done', speedBps: 0, finishedAt: Date.now() }) })
      .catch((e) => { engine.cleanup(); if (!e.message.includes('cancelled')) patchReceiver(socketId, { phase: 'error', error: e.message }) })
  }

  function patchReceiver(socketId, partial) {
    setReceivers((prev) => prev.map((r) => r.socketId === socketId ? { ...r, ...partial } : r))
  }

  const skipFile = useCallback((fileIndex) => {
    peersRef.current.forEach(({ engine }) => { engine?.skipFile(fileIndex) })
    setFileList((prev) => prev.map((f, i) =>
      i === fileIndex && f.status !== 'done' ? { ...f, status: 'skipped' } : f
    ))
  }, [])

  const cancelReceiver = useCallback((socketId) => {
    const peer = peersRef.current.get(socketId)
    if (peer?.engine) peer.engine.cancel()
    patchReceiver(socketId, { phase: 'error', error: 'Cancelled by sender.' })
  }, [])

  const closeSession = useCallback(() => {
    const socket = getSocket()
    if (socket) { socket.emit('close-share'); socket.off('peer-joined'); socket.off('peer-left'); socket.off('signal') }
    peersRef.current.forEach(({ pc, dc, engine }) => {
      engine?.cleanup(); engine?.cancel()
      try { dc.close() } catch {} try { pc.close() } catch {}
    })
    peersRef.current.clear(); speedTrackRef.current.clear()
    setSessionId(null); setPhase('idle'); setReceivers([])
    setSelectedFiles([]); setFileList([]); setTotalSize(0)
    filesRef.current = []
  }, [getSocket])

  return {
    phase, sessionId, receivers, fileList, selectedFiles, totalSize, selectionMode,
    handleFilesSelected, removeFile, announce, skipFile, cancelReceiver, closeSession,
  }
}
