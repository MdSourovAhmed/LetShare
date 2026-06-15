import { useState, useRef, useCallback } from 'react'
import { RTC_CONFIG, CONNECT_TIMEOUT_MS } from '@letshare/core/lib/webrtc'
import { useSpeedTracker } from '@letshare/core/hooks/useSpeedTracker'

/**
 * Manages the receiver side of a LAN session join.
 * Accepts a socket from useLobby.
 */
export function useJoinSession(getSocket) {
  const [phase,         setPhase]         = useState('idle')
  const [statusText,    setStatusText]     = useState('')
  const [fileRows,      setFileRows]       = useState([])
  const [totalSize,     setTotalSize]      = useState(0)
  const [totalReceived, setTotalReceived]  = useState(0)
  const [startedAt,     setStartedAt]      = useState(null)
  const [finishedAt,    setFinishedAt]     = useState(null)
  const [error,         setError]          = useState(null)

  const { speedBps, speedHistory, peakBps, onBytes, reset: resetSpeed } = useSpeedTracker()

  const pcRef      = useRef(null)
  const dcRef      = useRef(null)
  const buffers    = useRef([])
  const fileRecv   = useRef([])
  const curIdx     = useRef(-1)
  const metaRef    = useRef([])
  const totalRef   = useRef(0)

  const joinSession = useCallback((sessionId, pin = null) => {
    const socket = getSocket()
    if (!socket) return

    resetSpeed()
    setPhase('joining')
    setStatusText('Joining session…')
    setError(null)

    socket.emit('join-share', { sessionId, pin })

    socket.once('join-rejected', ({ reason }) => {
      setPhase('error')
      setError(reason || 'Access denied.')
      cleanup(socket)
    })

    socket.once('join-accepted', ({ ownerSocketId }) => {
      setPhase('connecting')
      setStatusText('Establishing connection…')
      startWebRTC(socket, ownerSocketId)
    })

    const timeout = setTimeout(() => {
      if (phase !== 'receiving' && phase !== 'done') {
        setPhase('error')
        setError('Connection timed out.')
        cleanup(socket)
      }
    }, CONNECT_TIMEOUT_MS)

    socket._joinTimeout = timeout
  }, [getSocket, resetSpeed])

  function startWebRTC(socket, ownerSocketId) {
    const handler = async ({ fromSocketId, payload }) => {
      if (fromSocketId !== ownerSocketId) return
      try {
        if (payload.type === 'offer') {
          if (pcRef.current) pcRef.current.close()
          buildPeerConnection(socket, ownerSocketId)
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

  function buildPeerConnection(socket, ownerSocketId) {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc
    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('signal', { toSocketId: ownerSocketId, payload: { type: 'ice', candidate: e.candidate } })
    }
    pc.ondatachannel = (e) => {
      const dc = e.channel
      dcRef.current = dc
      dc.binaryType = 'arraybuffer'
      dc.onopen    = () => { setPhase('receiving'); setStatusText('Receiving files…'); setStartedAt(Date.now()) }
      dc.onmessage = onData
      dc.onclose   = () => setStatusText('Connection closed.')
    }
  }

  function onData(e) {
    const data = e.data
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data)
        if (msg?.type === 'manifest') {
          const meta = msg.files || []
          metaRef.current  = meta
          totalRef.current = meta.reduce((s, f) => s + (f.size || 0), 0)
          buffers.current  = meta.map(() => [])
          fileRecv.current = meta.map(() => 0)
          curIdx.current   = -1
          setTotalSize(totalRef.current)
          setFileRows(meta.map((f) => ({ path: f.path || f.name, name: f.name, size: f.size, type: f.type, progress: 0, url: null })))
          return
        }
        if (msg?.type === 'start') { curIdx.current = msg.index; return }
        if (msg?.type === 'end') {
          const i    = msg.index
          const blob = new Blob(buffers.current[i], { type: metaRef.current[i]?.type || 'application/octet-stream' })
          const url  = URL.createObjectURL(blob)
          setFileRows((prev) => prev.map((r, idx) => idx === i ? { ...r, progress: 100, url } : r))
          return
        }
        if (msg?.type === 'all_done') {
          setPhase('done'); setStatusText('All files received!'); setFinishedAt(Date.now())
          return
        }
      } catch {}
    }

    const ab = data instanceof ArrayBuffer ? data : null
    if (!ab || curIdx.current < 0) return
    const i = curIdx.current
    buffers.current[i].push(new Uint8Array(ab))
    fileRecv.current[i] += ab.byteLength
    onBytes(ab.byteLength)

    const size     = metaRef.current[i]?.size || 0
    const progress = size ? Math.floor((fileRecv.current[i] / size) * 100) : 0
    const received = fileRecv.current.reduce((s, x) => s + x, 0)
    setTotalReceived(received)
    setFileRows((prev) => prev.map((r, idx) => idx === i ? { ...r, progress } : r))
  }

  function cleanup(socket) {
    if (socket._joinTimeout)  clearTimeout(socket._joinTimeout)
    if (socket._signalHandler) socket.off('signal', socket._signalHandler)
    try { dcRef.current?.close() } catch {}
    try { pcRef.current?.close() } catch {}
  }

  const reset = useCallback(() => {
    const socket = getSocket()
    if (socket) cleanup(socket)
    pcRef.current = null; dcRef.current = null
    buffers.current = []; fileRecv.current = []; metaRef.current = []
    curIdx.current = -1; totalRef.current = 0
    resetSpeed()
    setPhase('idle'); setStatusText(''); setFileRows([])
    setTotalSize(0); setTotalReceived(0)
    setStartedAt(null); setFinishedAt(null); setError(null)
  }, [getSocket, resetSpeed])

  return {
    phase, statusText, error,
    fileRows, totalSize, totalReceived,
    speedBps, speedHistory, peakBps,
    startedAt, finishedAt,
    joinSession, reset,
  }
}