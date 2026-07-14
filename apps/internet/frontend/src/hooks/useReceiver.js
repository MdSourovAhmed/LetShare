



/**
 * useReceiver — v2.3
 * Adds telemetry via useTelemetry. All hooks fire outside the hot path.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import  createSocket            from '../lib/socket'
import { HANDSHAKE_TIMEOUT_MS }   from '@letshare/core/lib/webrtc'
import { RTC_CONFIG }             from '../lib/rtcConfig'
import { useSpeedTracker }        from '@letshare/core/hooks/useSpeedTracker'
import { useThrottledProgress }   from '@letshare/core/hooks/useThrottledProgress'
import { useTelemetry }           from '@letshare/core/lib/useTelemetry'

export function useReceiver(linkId) {
  const [state, setState] = useState({
    phase: 'idle', statusText: 'Initializing…',
    fileRows: [], totalSize: 0, totalReceived: 0,
    startedAt: null, finishedAt: null,
  })

  const { speedBps, speedHistory, peakBps, onBytes, reset: resetSpeed } = useSpeedTracker()
  const { throttledUpdate, flushNow } = useThrottledProgress(100)
  const telemetry = useTelemetry({ mode: 'internet', role: 'receiver' })

  const socketRef      = useRef(null)
  const pcRef          = useRef(null)
  const dcRef          = useRef(null)
  const handshakeTimer = useRef(null)

  const buffers        = useRef([])
  const fileReceived   = useRef([])
  const currentIndex   = useRef(-1)
  const filesMeta      = useRef([])
  const totalSizeRef   = useRef(0)

  const patch = useCallback((p) => setState((s) => ({ ...s, ...p })), [])

  function clearHandshakeTimer() {
    if (handshakeTimer.current) { clearTimeout(handshakeTimer.current); handshakeTimer.current = null }
  }

  useEffect(() => {
    if (!linkId) { patch({ phase: 'error', statusText: 'No link ID in URL.' }); return }

    patch({ phase: 'connecting', statusText: 'Connecting to sender…' })
    resetSpeed()
    telemetry.onSessionCreate()

    const socket = createSocket()
    socketRef.current = socket

    socket.on('connect_error', () =>
      patch({ phase: 'error', statusText: 'Could not reach signaling server.' }))

    socket.on('signal', async ({ fromSocketId, payload }) => {
      try {
        if (payload.type === 'offer') {
          if (pcRef.current) pcRef.current.close()
          pcRef.current = null
          buildPeerConnection(socket, linkId, fromSocketId)
          const pc = pcRef.current
          await pc.setRemoteDescription(payload.sdp)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('signal', { linkId, toSocketId: fromSocketId,
            payload: { type: 'answer', sdp: answer } })
        } else if (payload.type === 'ice' && pcRef.current) {
          await pcRef.current.addIceCandidate(payload.candidate)
        }
      } catch (e) {
        console.error('receiver signal', e)
        patch({ phase: 'error', statusText: 'Connection error.' })
      }
    })

    socket.emit('join', { linkId, role: 'receiver' })

    handshakeTimer.current = setTimeout(() => {
      if (dcRef.current?.readyState === 'open') return
      patch({ phase: 'error', statusText: 'Timeout — sender may be offline.' })
    }, HANDSHAKE_TIMEOUT_MS)

    return () => {
      clearHandshakeTimer()
      try { dcRef.current?.close() } catch {}
      try { pcRef.current?.close() } catch {}
      socket.disconnect()
    }
  }, [linkId]) // eslint-disable-line

  function buildPeerConnection(socket, linkId, senderSocketId) {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('signal', { linkId, toSocketId: senderSocketId,
          payload: { type: 'ice', candidate: e.candidate } })
    }

    pc.ondatachannel = (e) => {
      const dc = e.channel
      dcRef.current = dc
      dc.binaryType = 'arraybuffer'
      dc.onopen = () => {
        clearHandshakeTimer()
        telemetry.onChannelOpen(pc)
        patch({ phase: 'receiving', statusText: 'Receiving files…', startedAt: Date.now() })
      }
      dc.onmessage = onData
      dc.onclose = () =>
        setState((s) => s.phase === 'done' || s.phase === 'cancelled' ? s
          : { ...s, phase: 'error', statusText: 'Connection lost.' })
    }
  }

  function onData(e) {
    const data = e.data
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data)
        if (msg?.type === 'manifest') {
          const meta = msg.files || []
          filesMeta.current    = meta
          totalSizeRef.current = meta.reduce((s, f) => s + (f.size || 0), 0)
          buffers.current      = meta.map(() => [])
          fileReceived.current = meta.map(() => 0)
          currentIndex.current = -1
          patch({
            totalSize: totalSizeRef.current,
            fileRows:  meta.map((f) => ({
              path: f.path || f.name, name: f.name,
              size: f.size, type: f.type, progress: 0, url: null, status: 'pending',
            })),
          })
          return
        }
        if (msg?.type === 'start') {
          const i = msg.index
          currentIndex.current = i
          telemetry.onFileStart(i, filesMeta.current[i]?.size ?? 0)
          setState((s) => ({
            ...s,
            fileRows: s.fileRows.map((r, idx) => idx === i ? { ...r, status: 'receiving' } : r),
          }))
          return
        }
        if (msg?.type === 'end') {
          const i    = msg.index
          const blob = new Blob(buffers.current[i],
            { type: filesMeta.current[i]?.type || 'application/octet-stream' })
          const url  = URL.createObjectURL(blob)
          buffers.current[i] = []
          telemetry.onFileEnd(i)
          flushNow()
          setState((s) => ({
            ...s,
            fileRows: s.fileRows.map((r, idx) =>
              idx === i ? { ...r, progress: 100, url, status: 'done' } : r),
          }))
          return
        }
        if (msg?.type === 'file_cancelled') {
          const i = msg.index
          buffers.current[i] = []
          flushNow()
          setState((s) => ({
            ...s,
            fileRows: s.fileRows.map((r, idx) =>
              idx === i ? { ...r, status: 'skipped' } : r),
          }))
          return
        }
        if (msg?.type === 'all_done') {
          flushNow()
          const end = Date.now()
          patch({ phase: 'done', statusText: 'All files received!', finishedAt: end })
          // Finalise telemetry after completion
          setState((s) => {
            telemetry.finalise({
              totalBytes:   s.totalReceived,
              peakSpeedBps: peakBps,
              speedSamples: speedHistory,
              fileList:     s.fileRows.map((r) => ({
                path: r.path, size: r.size, status: r.status || 'done',
              })),
              outcome: 'done',
            })
            return s
          })
          return
        }
        if (msg?.type === 'cancelled') {
          flushNow()
          patch({ phase: 'cancelled', statusText: 'Sender cancelled the transfer.' })
          return
        }
      } catch {}
    }

    const ab = data instanceof ArrayBuffer ? data : null
    if (!ab || currentIndex.current < 0) return
    const i = currentIndex.current
    buffers.current[i].push(new Uint8Array(ab))
    fileReceived.current[i] += ab.byteLength
    onBytes(ab.byteLength)
    telemetry.onChunk()

    const size          = filesMeta.current[i]?.size || 0
    const progress      = size ? Math.floor((fileReceived.current[i] / size) * 100) : 0
    const totalReceived = fileReceived.current.reduce((s, x) => s + x, 0)

    throttledUpdate(() => {
      setState((s) => ({
        ...s, totalReceived,
        fileRows: s.fileRows.map((r, idx) => idx === i ? { ...r, progress } : r),
      }))
    })
  }

  // Receiver-initiated file skip — sends 'receiver_skip' over the DataChannel.
  // The engine on the sender side reads it at its next yield point (Set.has check)
  // and skips the remainder of that file. Zero socket calls, zero server involvement.
  const skipFile = useCallback((fileIndex) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return
    try {
      dc.send(JSON.stringify({ type: 'receiver_skip', index: fileIndex }))
    } catch {}
    // Immediately update local UI — discard partial buffer
    buffers.current[fileIndex] = []
    setState((s) => ({
      ...s,
      fileRows: s.fileRows.map((r, idx) =>
        idx === fileIndex ? { ...r, status: 'skipped', progress: r.progress } : r
      ),
    }))
  }, [])

  return { state, speedBps, speedHistory, peakBps, skipFile }
}
