


/**
 * useJoinSession — v2.2
 * Adds skipFile() — sends 'receiver_skip' over DataChannel, discards partial buffer.
 * Handles 'file_skipped' from sender. fileRows carry a `status` field.
 */
import { useState, useRef, useCallback } from 'react'
import { RTC_CONFIG, HANDSHAKE_TIMEOUT_MS } from '@letshare/core/lib/webrtc'
import { useSpeedTracker }      from '@letshare/core/hooks/useSpeedTracker'
import { useThrottledProgress } from '@letshare/core/hooks/useThrottledProgress'
import { useTelemetry }          from '@letshare/core/lib/useTelemetry'

export function useJoinSession(getSocket) {
  const [phase,         setPhase]         = useState('idle')
  const [statusText,    setStatusText]    = useState('')
  const [fileRows,      setFileRows]      = useState([])
  const [totalSize,     setTotalSize]     = useState(0)
  const [totalReceived, setTotalReceived] = useState(0)
  const [startedAt,     setStartedAt]     = useState(null)
  const [finishedAt,    setFinishedAt]    = useState(null)
  const [error,         setError]         = useState(null)

  const { speedBps, speedHistory, peakBps, onBytes, reset: resetSpeed } = useSpeedTracker()
  const { throttledUpdate, flushNow } = useThrottledProgress(100)
  const telemetry = useTelemetry({ mode: 'lan', role: 'receiver' })

  const pcRef          = useRef(null)
  const dcRef          = useRef(null)
  const buffers        = useRef([])
  const fileRecv       = useRef([])
  const curIdx         = useRef(-1)
  const metaRef        = useRef([])
  const totalRef       = useRef(0)
  const handshakeTimer = useRef(null)

  function clearHandshakeTimer() {
    if (handshakeTimer.current) { clearTimeout(handshakeTimer.current); handshakeTimer.current = null }
  }

  const joinSession = useCallback((sessionId, pin = null) => {
    const socket = getSocket()
    if (!socket) return
    resetSpeed(); setPhase('joining'); setStatusText('Joining session…'); setError(null)
    telemetry.onSessionCreate()
    socket.emit('join-share', { sessionId, pin })
    socket.once('join-rejected', ({ reason }) => { setPhase('error'); setError(reason || 'Access denied.'); cleanup(socket) })
    socket.once('join-accepted', ({ ownerSocketId }) => { setPhase('connecting'); setStatusText('Establishing connection…'); startWebRTC(socket, ownerSocketId) })
    handshakeTimer.current = setTimeout(() => {
      if (dcRef.current?.readyState === 'open') return
      setPhase('error'); setError('Connection timed out — sender may be offline.'); cleanup(socket)
    }, HANDSHAKE_TIMEOUT_MS)
  }, [getSocket, resetSpeed])

  function startWebRTC(socket, ownerSocketId) {
    const handler = async ({ fromSocketId, payload }) => {
      if (fromSocketId !== ownerSocketId) return
      try {
        if (payload.type === 'offer') {
          if (pcRef.current) pcRef.current.close()
          buildPC(socket, ownerSocketId)
          const pc = pcRef.current
          await pc.setRemoteDescription(payload.sdp)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('signal', { toSocketId: ownerSocketId, payload: { type: 'answer', sdp: answer } })
        } else if (payload.type === 'ice' && pcRef.current) {
          await pcRef.current.addIceCandidate(payload.candidate)
        }
      } catch (e) { console.error('join signal', e); setPhase('error'); setError('Connection error.') }
    }
    socket.on('signal', handler)
    socket._signalHandler = handler
  }

  function buildPC(socket, ownerSocketId) {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { toSocketId: ownerSocketId, payload: { type: 'ice', candidate: e.candidate } })
    }
    pc.ondatachannel = (e) => {
      const dc = e.channel
      dcRef.current = dc
      dc.binaryType = 'arraybuffer'
      dc.onopen = () => { clearHandshakeTimer(); setPhase('receiving'); setStatusText('Receiving files…'); setStartedAt(Date.now()) }
      dc.onmessage = onData
      dc.onclose = () => { setPhase((p) => { if (p === 'done' || p === 'cancelled') return p; setError('Connection lost.'); return 'error' }) }
    }
  }

  function onData(e) {
    const data = e.data
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data)
        if (msg?.type === 'manifest') {
          const meta = msg.files || []
          metaRef.current = meta; totalRef.current = meta.reduce((s, f) => s + (f.size || 0), 0)
          buffers.current = meta.map(() => []); fileRecv.current = meta.map(() => 0); curIdx.current = -1
          setTotalSize(totalRef.current)
          setFileRows(meta.map((f) => ({ path: f.path || f.name, name: f.name, size: f.size, type: f.type, progress: 0, url: null, status: 'pending' })))
          return
        }
        if (msg?.type === 'start') {
          curIdx.current = msg.index
          setFileRows((prev) => prev.map((r, i) => i === msg.index ? { ...r, status: 'receiving' } : r))
          return
        }
        if (msg?.type === 'end') {
          const i = msg.index
          const blob = new Blob(buffers.current[i], { type: metaRef.current[i]?.type || 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          buffers.current[i] = []
          flushNow()
          setFileRows((prev) => prev.map((r, idx) => idx === i ? { ...r, progress: 100, url, status: 'done' } : r))
          return
        }
        if (msg?.type === 'file_skipped') {
          const i = msg.index
          buffers.current[i] = []; fileRecv.current[i] = 0
          flushNow()
          setFileRows((prev) => prev.map((r, idx) => idx === i ? { ...r, progress: 0, url: null, status: 'skipped' } : r))
          return
        }
        if (msg?.type === 'all_done') { flushNow(); setPhase('done'); setStatusText('All files received!'); setFinishedAt(Date.now()); return }
        if (msg?.type === 'cancelled') { flushNow(); setPhase('cancelled'); setStatusText('Sender cancelled the transfer.'); return }
      } catch {}
    }
    const ab = data instanceof ArrayBuffer ? data : null
    if (!ab || curIdx.current < 0) return
    const i = curIdx.current
    buffers.current[i].push(new Uint8Array(ab)); fileRecv.current[i] += ab.byteLength; onBytes(ab.byteLength)
    const size = metaRef.current[i]?.size || 0
    const progress = size ? Math.floor((fileRecv.current[i] / size) * 100) : 0
    const received = fileRecv.current.reduce((s, x) => s + x, 0)
    throttledUpdate(() => { setTotalReceived(received); setFileRows((prev) => prev.map((r, idx) => idx === i ? { ...r, progress } : r)) })
  }

  const skipFile = useCallback((fileIndex) => {
    const dc = dcRef.current
    if (dc?.readyState === 'open') {
      try { dc.send(JSON.stringify({ type: 'receiver_skip', index: fileIndex })) } catch {}
    }
    buffers.current[fileIndex] = []; fileRecv.current[fileIndex] = 0
    setFileRows((prev) => prev.map((r, i) => i === fileIndex ? { ...r, progress: 0, url: null, status: 'skipped' } : r))
  }, [])

  function cleanup(socket) {
    clearHandshakeTimer()
    if (socket?._signalHandler) socket.off('signal', socket._signalHandler)
    try { dcRef.current?.close() } catch {} try { pcRef.current?.close() } catch {}
  }

  const cancel = useCallback(() => {
    buffers.current.forEach((_, i) => { buffers.current[i] = [] })
    setFileRows((prev) => prev.map((r) => { if (r.url) URL.revokeObjectURL(r.url); return { ...r, url: null } }))
    setPhase('cancelled'); setStatusText('Transfer cancelled.')
    cleanup(getSocket())
  }, [getSocket])

  const reset = useCallback(() => {
    cleanup(getSocket())
    pcRef.current = null; dcRef.current = null
    buffers.current = []; fileRecv.current = []; metaRef.current = []
    curIdx.current = -1; totalRef.current = 0
    resetSpeed()
    setPhase('idle'); setStatusText(''); setFileRows([])
    setTotalSize(0); setTotalReceived(0); setStartedAt(null); setFinishedAt(null); setError(null)
  }, [getSocket, resetSpeed])

  return { phase, statusText, error, fileRows, totalSize, totalReceived, speedBps, speedHistory, peakBps, startedAt, finishedAt, joinSession, skipFile, cancel, reset }
}
