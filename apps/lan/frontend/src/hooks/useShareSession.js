import { useState, useRef, useCallback } from 'react'
import { getFilePath } from '@letshare/core/lib/utils'
import { RTC_CONFIG, CHUNK_SIZE, BUFFER_LOW } from '@letshare/core/lib/webrtc'
import { useSpeedTracker } from '@letshare/core/hooks/useSpeedTracker'

/**
 * Manages the sharer side of a LAN session.
 * Accepts a socket from useLobby — does not create its own connection.
 *
 * Usage:
 *   const { announce, closeSession, receivers, ... } = useShareSession(getSocket)
 */
export function useShareSession(getSocket) {
  const [sessionId,    setSessionId]    = useState(null)
  const [phase,        setPhase]        = useState('idle')   // idle | active | done
  const [receivers,    setReceivers]    = useState([])
  const [fileList,     setFileList]     = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [totalSize,    setTotalSize]    = useState(0)
  const [selectionMode, setSelectionMode] = useState('files')

  const peersRef   = useRef(new Map())  // Map<socketId, {pc, dc}>
  const filesRef   = useRef([])
  const speedTrackRef = useRef(new Map())

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFilesSelected = useCallback((files, mode = 'files') => {
    const arr  = Array.from(files)
    const size = arr.reduce((s, f) => s + f.size, 0)
    filesRef.current = arr
    setSelectedFiles(arr)
    setTotalSize(size)
    setSelectionMode(mode)
    setFileList(arr.map((f) => ({
      path: getFilePath(f), name: f.name, size: f.size,
      type: f.type || 'application/octet-stream',
    })))
  }, [])

  // ── Announce share to lobby ─────────────────────────────────────────────────
  const announce = useCallback(({ mode = 'open', pin = null, label } = {}) => {
    const socket = getSocket()
    if (!socket || !filesRef.current.length) return

    const fileCount = filesRef.current.length
    const totalSz   = filesRef.current.reduce((s, f) => s + f.size, 0)
    const autoLabel = label || `${fileCount} file${fileCount !== 1 ? 's' : ''}`

    socket.emit('announce-share', { label: autoLabel, mode, pin, fileCount, totalSize: totalSz })

    socket.once('session-created', ({ sessionId: sid }) => {
      setSessionId(sid)
      setPhase('active')
    })

    // Listen for incoming receivers
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

  // ── Add a receiver & open RTCPeerConnection ─────────────────────────────────
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
    dc.onopen  = () => { patchReceiver(socketId, { phase: 'transferring', startedAt: Date.now() }); sendFilesToPeer(socketId, dc) }
    dc.onclose = () => patchReceiver(socketId, { phase: 'error', error: 'Connection closed' })
    dc.onerror = () => patchReceiver(socketId, { phase: 'error', error: 'Connection error' })

    peersRef.current.set(socketId, { pc, dc })

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => socket.emit('signal', {
        toSocketId: socketId,
        payload: { type: 'offer', sdp: pc.localDescription },
      }))
      .catch((e) => patchReceiver(socketId, { phase: 'error', error: e.message }))
  }

  // ── Send files to one peer ──────────────────────────────────────────────────
  async function sendFilesToPeer(socketId, dc) {
    const files       = filesRef.current
    const perFileSent = files.map(() => 0)

    dc.send(JSON.stringify({
      type: 'manifest', version: 2,
      files: files.map((f) => ({ path: getFilePath(f), name: f.name, size: f.size, type: f.type || 'application/octet-stream' })),
    }))

    dc.bufferedAmountLowThreshold = BUFFER_LOW

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      dc.send(JSON.stringify({ type: 'start', index: i }))
      let offset = 0
      while (offset < f.size) {
        if (dc.readyState !== 'open') { patchReceiver(socketId, { phase: 'error', error: 'Channel closed' }); return }
        const slice = await f.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
        dc.send(slice)
        offset += slice.byteLength
        perFileSent[i] = offset

        const totalSent = perFileSent.reduce((s, x) => s + x, 0)
        const fp        = f.size ? Math.floor((offset / f.size) * 100) : 100

        const track   = speedTrackRef.current.get(socketId)
        const now     = Date.now()
        const elapsed = (now - track.lastTime) / 1000
        if (elapsed >= 0.25) {
          const speedBps = Math.round((totalSent - track.lastBytes) / elapsed)
          track.lastBytes = totalSent; track.lastTime = now
          setReceivers((prev) => prev.map((r) => {
            if (r.socketId !== socketId) return r
            const fp2 = [...r.fileProgress]; fp2[i] = fp
            return { ...r, fileProgress: fp2, totalSent, speedBps, speedHistory: [...r.speedHistory, speedBps].slice(-20) }
          }))
        } else {
          setReceivers((prev) => prev.map((r) => {
            if (r.socketId !== socketId) return r
            const fp2 = [...r.fileProgress]; fp2[i] = fp
            return { ...r, fileProgress: fp2, totalSent }
          }))
        }
        if (dc.bufferedAmount > BUFFER_LOW) await waitForBufferLow(dc)
      }
      dc.send(JSON.stringify({ type: 'end', index: i }))
    }

    dc.send(JSON.stringify({ type: 'all_done' }))
    patchReceiver(socketId, { phase: 'done', speedBps: 0, finishedAt: Date.now() })
    setReceivers((prev) => {
      const allDone = prev.every((r) => r.socketId === socketId ? true : r.phase === 'done')
      if (allDone) setPhase('done')
      return prev
    })
  }

  function patchReceiver(socketId, partial) {
    setReceivers((prev) => prev.map((r) => r.socketId === socketId ? { ...r, ...partial } : r))
  }

  function waitForBufferLow(dc) {
    return new Promise((resolve) => {
      const check = () => dc.bufferedAmount <= dc.bufferedAmountLowThreshold ? resolve() : setTimeout(check, 10)
      check()
    })
  }

  // ── Close session ───────────────────────────────────────────────────────────
  const closeSession = useCallback(() => {
    const socket = getSocket()
    if (socket) {
      socket.emit('close-share')
      socket.off('peer-joined')
      socket.off('peer-left')
      socket.off('signal')
    }
    peersRef.current.forEach(({ pc, dc }) => { try { dc.close() } catch {} try { pc.close() } catch {} })
    peersRef.current.clear()
    speedTrackRef.current.clear()
    setSessionId(null); setPhase('idle'); setReceivers([])
    setSelectedFiles([]); setFileList([]); setTotalSize(0)
    filesRef.current = []
  }, [getSocket])

  return {
    phase, sessionId, receivers, fileList, selectedFiles, totalSize, selectionMode,
    handleFilesSelected, announce, closeSession,
  }
}