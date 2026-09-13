import { createHash }   from 'crypto'
import express          from 'express'
import { createServer } from 'http'
import { Server }       from 'socket.io'
import { Bonjour }      from 'bonjour-service'
import path             from 'path'
import                       'dotenv/config'
import { writeMetrics }    from '../../../packages/core/src/lib/metricsWriter.js'

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
})

// ── mDNS advertisement ────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3002')

const bonjour = new Bonjour()
bonjour.publish({ name: 'LetsShare', type: 'http', port: PORT })
console.log(`mDNS: advertising LetsShare at letshare.local:${PORT}`)

// ── SHA-256 via Web Crypto API ────────────────────────────────────────────────
// globalThis.crypto.subtle is built into Node 19+ — no import needed.
// Replaces: import { createHash } from 'crypto'   ← DEP0180 (deprecated in Node 22+)
// Replaces: import { createHash } from 'node:crypto' + createHash('sha256')...
//
// Why SubtleCrypto?
//   • It is the Web Standard — identical API in browsers and Node 19+
//   • No import statement required (globally available)
//   • Future-proof: the legacy hash API will eventually be removed
//   • Async — non-blocking, suits a server event loop
async function sha256(str) {
  const encoded    = new TextEncoder().encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray  = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Session ID generator ──────────────────────────────────────────────────────
// crypto.randomUUID() is also globally available in Node 19+ via Web Crypto.
// More collision-resistant than Math.random().toString(36).
function generateSessionId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

// ── In-memory lobby state ─────────────────────────────────────────────────────
/**
 * peers:    Map<socketId, { name: string, socketId: string }>
 * sessions: Map<sessionId, {
 *   sessionId:     string,
 *   ownerSocketId: string,
 *   ownerName:     string,
 *   label:         string,
 *   mode:          'open' | 'pin',
 *   pinHash:       string | null,
 *   fileCount:     number,
 *   totalSize:     number,
 *   receivers:     Set<socketId>,
 * }>
 */
const peers    = new Map()
const sessions = new Map()

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

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', mode: 'lan', peers: peers.size, sessions: sessions.size })
)

// ── Metrics endpoint ──────────────────────────────────────────────────────────
app.post('/api/metrics', (req, res) => {
  res.sendStatus(204)
  writeMetrics(req.body).catch(() => {})
})

// ── Static frontend ───────────────────────────────────────────────────────────
// FIX: import.meta.url is the correct ESM equivalent of __dirname.
// path.resolve() returns the current working directory (process.cwd()), which
// changes depending on where you run `node server.js` from — unreliable.
// fileURLToPath(import.meta.url) always gives the directory of THIS file.
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

app.use(express.static(path.join(__dirname, '../frontend/dist')))

// FIX: '/{*splat}' is Express 5 syntax. Express 4 (which this project uses)
// requires a different catch-all. Use a regex route that matches everything
// except paths starting with /socket.io (to avoid catching WS upgrades).
app.get(/^(?!\/socket\.io).*$/, (_req, res) =>
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
  // FIX: sha256 is now async — use async handler and await the hash
  socket.on('announce-share', async ({ label, mode, pin, fileCount, totalSize } = {}) => {
    if (socket.data.sessionId) {
      sessions.delete(socket.data.sessionId)
    }

    const sessionId = generateSessionId()

    // Hash the PIN before storing — server never holds the plain PIN
    const pinHash = (mode === 'pin' && pin)
      ? await sha256(String(pin))
      : null

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
    const { sessionId } = socket.data
    if (!sessionId) return
    sessions.delete(sessionId)
    socket.data.sessionId = null
    broadcastLobby()
  })

  // ── Receiver requests to join a session ─────────────────────────────────────
  // FIX: async handler — PIN comparison now awaits sha256()
  socket.on('join-share', async ({ sessionId, pin } = {}) => {
    const session = sessions.get(sessionId)
    if (!session) {
      socket.emit('join-rejected', { reason: 'Session not found.' })
      return
    }

    if (session.mode === 'pin') {
      const attempt = pin ? await sha256(String(pin)) : ''
      if (attempt !== session.pinHash) {
        socket.emit('join-rejected', { reason: 'Incorrect PIN.' })
        return
      }
    }

    session.receivers.add(socket.id)
    socket.emit('join-accepted', { sessionId, ownerSocketId: session.ownerSocketId })

    io.to(session.ownerSocketId).emit('peer-joined', {
      socketId: socket.id,
      role:     'receiver',
      name:     socket.data.name || 'Anonymous',
    })

    broadcastLobby()
    console.log(`[session] ${socket.data.name} joined session ${sessionId}`)
  })

  // ── WebRTC signal routing ────────────────────────────────────────────────────
  socket.on('signal', ({ toSocketId, payload } = {}) => {
    if (!toSocketId || !payload) return
    io.to(toSocketId).emit('signal', { fromSocketId: socket.id, payload })
  })

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { name, sessionId } = socket.data || {}

    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId)
    }

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

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(sig) {
  console.log(`\n${sig} — shutting down`)
  bonjour.unpublishAll(() => bonjour.destroy())
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))