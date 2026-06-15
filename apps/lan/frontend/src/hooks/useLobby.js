import { useState, useEffect, useRef, useCallback } from 'react'
import { createSocket } from '../lib/socket'

/**
 * Manages LAN lobby presence.
 * Connects to the server, registers a display name,
 * and keeps a live list of peers and active sessions.
 */
export function useLobby(displayName) {
  const [peers,    setPeers]    = useState([])
  const [sessions, setSessions] = useState([])
  const [mySocketId, setMySocketId] = useState(null)
  const [connected,  setConnected]  = useState(false)

  const socketRef = useRef(null)

  useEffect(() => {
    if (!displayName) return

    const socket = createSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setMySocketId(socket.id)
      setConnected(true)
      socket.emit('join-lobby', { name: displayName })
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('lobby-update', ({ peers: p, sessions: s }) => {
      setPeers(p)
      setSessions(s)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
      setMySocketId(null)
    }
  }, [displayName])

  const getSocket = useCallback(() => socketRef.current, [])

  return { peers, sessions, mySocketId, connected, getSocket }
}