import React, { useState, useRef, useCallback } from 'react'
import { createSocket } from '../lib/socket'
// import { generateId, getFilePath } from '@letshare/core/lib/utils'
// import { RTC_CONFIG, CHUNK_SIZE, BUFFER_LOW } from '@letshare/core/lib/webrtc'
import { generateId, getFilePath } from '../lib/utils'
import { RTC_CONFIG, CHUNK_SIZE, BUFFER_LOW } from '../lib/webrtc'

/**
 * @typedef {{
 *   socketId: string,
 *   label: string,
 *   phase: 'connecting'|'transferring'|'done'|'error',
 *   fileProgress: number[],
 *   totalSent: number,
 *   speedBps: number,          // current bytes/sec
 *   speedHistory: number[],    // last 20 samples for sparkline
 *   startedAt: number|null,    // Date.now() when transfer began
 *   finishedAt: number|null,   // Date.now() when done
 *   error: string|null,
 * }} ReceiverEntry
 */

const initialState = {
  phase: 'idle',
  linkId: null,
  shareLink: null,
  statusText: 'Ready to share',
  /** @type {ReceiverEntry[]} */
  receivers: [],
  /** @type {Array<{path:string,name:string,size:number,type:string}>} */
  fileList: [],
  totalSize: 0,
  selectionMode: null,
}

export function useSender() {
  const [state, setState] = useState(initialState)
  const [selectedFiles, setSelectedFiles] = useState([])

  const socketRef  = useRef(null)
  const peersRef   = useRef(new Map())
  const filesRef   = useRef([])

  // Per-receiver speed tracking: Map<socketId, { lastBytes, lastTime }>
  const speedTrackRef = useRef(new Map())

  const patch = useCallback(
    (partial) => setState((s) => ({ ...s, ...partial })),
    []
  )

  const handleFilesSelected = useCallback((files, mode = 'files') => {
    const arr = Array.from(files)
    filesRef.current = arr
    setSelectedFiles(arr)
    const totalSize = arr.reduce((s, f) => s + f.size, 0)
    const fileList  = arr.map((f) => ({
      path: getFilePath(f),
      name: f.name,
      size: f.size,
      type: f.type || 'application/octet-stream',
    }))
    patch({ fileList, totalSize, totalSent: 0, selectionMode: mode })
  }, [patch])

  const createSession = useCallback(() => {
    if (!selectedFiles.length) return

    const linkId    = generateId()
    const shareLink = `${window.location.origin}/receive?id=${linkId}`
    patch({ phase: 'waiting', linkId, shareLink,
            statusText: 'Waiting for receivers… Share the link on your LAN.', receivers: [] })

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
        if (payload.type === 'answer')
          await peer.pc.setRemoteDescription(payload.sdp)
        else if (payload.type === 'ice')
          await peer.pc.addIceCandidate(payload.candidate)
      } catch (e) { console.error('signal error', e) }
    })

    socket.emit('join', { linkId, role: 'sender' })
  }, [selectedFiles, patch])

  function addReceiver(socket, linkId, socketId) {
    const label = `Receiver ${peersRef.current.size + 1}`

    setState((s) => ({
      ...s,
      phase: 'active',
      statusText: 'Receivers connected — transfers running',
      receivers: [...s.receivers, {
        socketId, label,
        phase: 'connecting',
        fileProgress: filesRef.current.map(() => 0),
        totalSent: 0,
        speedBps: 0,
        speedHistory: [],
        startedAt: null,
        finishedAt: null,
        error: null,
      }],
    }))

    speedTrackRef.current.set(socketId, { lastBytes: 0, lastTime: Date.now() })

    const pc = new RTCPeerConnection(RTC_CONFIG)
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('signal', { linkId, toSocketId: socketId,
          payload: { type: 'ice', candidate: e.candidate } })
    }

    const dc = pc.createDataChannel('file', { ordered: true })
    dc.binaryType = 'arraybuffer'
    dc.onopen  = () => {
      patchReceiver(socketId, { phase: 'transferring', startedAt: Date.now() })
      sendFilesToPeer(socketId, dc)
    }
    dc.onclose = () => patchReceiver(socketId, { phase: 'error', error: 'Connection closed' })
    dc.onerror = () => patchReceiver(socketId, { phase: 'error', error: 'Connection error' })

    peersRef.current.set(socketId, { pc, dc })

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => socket.emit('signal', { linkId, toSocketId: socketId,
          payload: { type: 'offer', sdp: pc.localDescription } }))
      .catch((e) => patchReceiver(socketId, { phase: 'error', error: e.message }))
  }

  async function sendFilesToPeer(socketId, dc) {
    const files       = filesRef.current
    const perFileSent = files.map(() => 0)

    dc.send(JSON.stringify({
      type: 'manifest', version: 2,
      files: files.map((f) => ({
        path: getFilePath(f), name: f.name, size: f.size,
        type: f.type || 'application/octet-stream',
      })),
    }))

    dc.bufferedAmountLowThreshold = BUFFER_LOW

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      dc.send(JSON.stringify({ type: 'start', index: i }))

      let offset = 0
      while (offset < f.size) {
        if (dc.readyState !== 'open') {
          patchReceiver(socketId, { phase: 'error', error: 'Channel closed mid-transfer' })
          return
        }
        const slice = await f.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
        dc.send(slice)
        offset += slice.byteLength

        perFileSent[i] = offset
        const totalSent = perFileSent.reduce((s, x) => s + x, 0)
        const fp        = f.size ? Math.floor((offset / f.size) * 100) : 100

        // ── Speed calculation (pure client-side) ─────────────────────────
        const track   = speedTrackRef.current.get(socketId)
        const now     = Date.now()
        const elapsed = (now - track.lastTime) / 1000
        let speedBps  = 0
        let newHistory

        if (elapsed >= 0.25) { // sample every ~250 ms
          speedBps = Math.round((totalSent - track.lastBytes) / elapsed)
          track.lastBytes = totalSent
          track.lastTime  = now
          speedTrackRef.current.set(socketId, track)

          setState((s) => ({
            ...s,
            receivers: s.receivers.map((r) => {
              if (r.socketId !== socketId) return r
              const fp2   = [...r.fileProgress]
              fp2[i]      = fp
              const hist  = [...r.speedHistory, speedBps].slice(-20)
              return { ...r, fileProgress: fp2, totalSent, speedBps, speedHistory: hist }
            }),
          }))
        } else {
          setState((s) => ({
            ...s,
            receivers: s.receivers.map((r) => {
              if (r.socketId !== socketId) return r
              const fp2 = [...r.fileProgress]
              fp2[i]    = fp
              return { ...r, fileProgress: fp2, totalSent }
            }),
          }))
        }

        if (dc.bufferedAmount > BUFFER_LOW) await waitForBufferLow(dc)
      }

      dc.send(JSON.stringify({ type: 'end', index: i }))
    }

    dc.send(JSON.stringify({ type: 'all_done' }))
    patchReceiver(socketId, { phase: 'done', speedBps: 0, finishedAt: Date.now() })

    setState((s) => {
      const allDone = s.receivers.every(
        (r) => r.socketId === socketId ? true : r.phase === 'done')
      return allDone
        ? { ...s, phase: 'done', statusText: 'All receivers received everything!' }
        : s
    })
  }

  function patchReceiver(socketId, partial) {
    setState((s) => ({
      ...s,
      receivers: s.receivers.map((r) =>
        r.socketId === socketId ? { ...r, ...partial } : r),
    }))
  }

  function waitForBufferLow(dc) {
    return new Promise((resolve) => {
      const check = () => {
        if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) resolve()
        else setTimeout(check, 10)
      }
      check()
    })
  }

  const copyLink = useCallback(async () => {
    if (!state.shareLink) return false
    try { await navigator.clipboard.writeText(state.shareLink); return true }
    catch { return false }
  }, [state.shareLink])

  const reset = useCallback(() => {
    peersRef.current.forEach(({ pc, dc }) => {
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

  return { state, selectedFiles, handleFilesSelected, createSession, copyLink, reset }
}