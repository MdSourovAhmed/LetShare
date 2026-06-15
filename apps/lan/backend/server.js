import express          from 'express'
import { createServer } from 'http'
import { Server }       from 'socket.io'
import { Bonjour }      from 'bonjour-service'
import path             from 'path'
import { createHash }   from 'crypto'
import                       'dotenv/config'

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
})

// ── mDNS advertisement ────────────────────────────────────────────────────────
// Advertises the service as letshare.local on the LAN so anyone can reach it
// by hostname without knowing the IP address.
const PORT = parseInt(process.env.PORT || '3002')

const bonjour = new Bonjour()
bonjour.publish({ name: 'LetsShare', type: 'http', port: PORT })
console.log(`mDNS: advertising LetsShare at letshare.local:${PORT}`)

// ── In-memory lobby state ─────────────────────────────────────────────────────
/**
 * peers:    Map<socketId, { name: string, socketId: string }>
 * sessions: Map<sessionId, {
 *   sessionId:     string,
 *   ownerSocketId: string,
 *   ownerName:     string,
 *   label:         string,      // "Photos — 12 files, 340 MB"
 *   mode:          'open'|'pin',
 *   pinHash:       string|null, // SHA-256 of PIN, never stored plain
 *   fileCount:     number,
 *   totalSize:     number,
 *   receivers:     Set<socketId>,
 * }>
 */
const peers    = new Map()
const sessions = new Map()

function sha256(str) {
  return createHash('sha256').update(str).digest('hex')
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 10)
}

function broadcastLobby() {
  const peerList = Array.from(peers.values())
  const sessionList = Array.from(sessions.values()).map((s) => ({
    sessionId:     s.sessionId,
    ownerSocketId: s.ownerSocketId,
    ownerName:     s.ownerName,
    label:         s.label,
    mode:          s.mode,
    fileCount:     s.fileCount,
    totalSize:     s.totalSize,
    receiverCount: s.receivers.size,
  }))
  io.to('lobby').emit('lobby-update', { peers: peerList, sessions: sessionList })
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', mode: 'lan', peers: peers.size, sessions: sessions.size })
)

// ── Static frontend ───────────────────────────────────────────────────────────
const __dirname = path.resolve()
app.use(express.static(path.join(__dirname, '../frontend/dist')))
app.get('/{*splat}', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
)

// ── Lobby signaling ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id)

  // ── Join lobby ──────────────────────────────────────────────────────────────
  socket.on('join-lobby', ({ name } = {}) => {
    const displayName = (name || 'Anonymous').trim().slice(0, 32)
    peers.set(socket.id, { name: displayName, socketId: socket.id })
    socket.join('lobby')
    socket.data = { name: displayName, sessionId: null }
    console.log(`[lobby] ${displayName} joined (${socket.id})`)
    broadcastLobby()
  })

  // ── Announce a share ────────────────────────────────────────────────────────
  socket.on('announce-share', ({ label, mode, pin, fileCount, totalSize } = {}) => {
    // Close any existing session this peer owns
    if (socket.data.sessionId) {
      sessions.delete(socket.data.sessionId)
    }

    const sessionId = generateSessionId()
    const pinHash   = mode === 'pin' && pin ? sha256(String(pin)) : null

    sessions.set(sessionId, {
      sessionId,
      ownerSocketId: socket.id,
      ownerName:     socket.data.name || 'Anonymous',
      label:         (label || 'Shared files').slice(0, 80),
      mode:          mode === 'pin' ? 'pin' : 'open',
      pinHash,
      fileCount:     Number(fileCount) || 0,
      totalSize:     Number(totalSize) || 0,
      receivers:     new Set(),
    })

    socket.data.sessionId = sessionId
    console.log(`[session] ${socket.data.name} announced: ${label} (${mode})`)
    broadcastLobby()

    socket.emit('session-created', { sessionId })
  })

  // ── Close share ─────────────────────────────────────────────────────────────
  socket.on('close-share', () => {
    const sessionId = socket.data.sessionId
    if (!sessionId) return
    sessions.delete(sessionId)
    socket.data.sessionId = null
    broadcastLobby()
  })

  // ── Receiver requests to join a session ─────────────────────────────────────
  socket.on('join-share', ({ sessionId, pin } = {}) => {
    const session = sessions.get(sessionId)
    if (!session) {
      socket.emit('join-rejected', { reason: 'Session not found.' })
      return
    }

    // PIN check
    if (session.mode === 'pin') {
      const attempt = pin ? sha256(String(pin)) : ''
      if (attempt !== session.pinHash) {
        socket.emit('join-rejected', { reason: 'Incorrect PIN.' })
        return
      }
    }

    // Admitted — add to receivers set and notify owner to open a peer connection
    session.receivers.add(socket.id)
    socket.emit('join-accepted', { sessionId, ownerSocketId: session.ownerSocketId })

    // Tell the owner a new receiver joined (triggers addReceiver on sender side)
    io.to(session.ownerSocketId).emit('peer-joined', {
      socketId: socket.id,
      role: 'receiver',
      name: socket.data.name || 'Anonymous',
    })

    broadcastLobby()
    console.log(`[session] ${socket.data.name} joined session ${sessionId}`)
  })

  // ── WebRTC signal routing (same as internet mode) ───────────────────────────
  socket.on('signal', ({ toSocketId, payload } = {}) => {
    if (!toSocketId || !payload) return
    io.to(toSocketId).emit('signal', { fromSocketId: socket.id, payload })
  })

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { name, sessionId } = socket.data || {}

    // If this peer owned a session, close it
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId)
    }

    // Remove from any session's receivers set
    sessions.forEach((s) => {
      if (s.receivers.has(socket.id)) {
        s.receivers.delete(socket.id)
        io.to(s.ownerSocketId).emit('peer-left', { socketId: socket.id })
      }
    })

    peers.delete(socket.id)
    broadcastLobby()
    console.log(`Disconnected: ${name || socket.id}`)
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () =>
  console.log(`LAN signaling server on :${PORT}  →  http://letshare.local:${PORT}`)
)

function shutdown(sig) {
  console.log(`\n${sig} — shutting down`)
  bonjour.unpublishAll(() => bonjour.destroy())
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
