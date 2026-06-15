import express          from 'express'
import { createServer } from 'http'
import { Server }       from 'socket.io'
import path             from 'path'
import                       'dotenv/config'

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
})

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'internet' }))

// ── Static frontend (production) ──────────────────────────────────────────────
const __dirname = path.resolve()
app.use(express.static(path.join(__dirname, '../frontend/dist')))
app.get('/{*splat}', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
)

// ── Signaling ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id)

  socket.on('join', ({ linkId, role } = {}) => {
    if (!linkId || !role) return
    socket.join(linkId)
    socket.data = { linkId, role }
    // Include socketId so sender can open a dedicated RTCPeerConnection per receiver
    socket.to(linkId).emit('peer-joined', { socketId: socket.id, role })
  })

  socket.on('signal', ({ linkId, toSocketId, payload } = {}) => {
    if (!linkId || !toSocketId || !payload) return
    // Route directly to one peer — never broadcast to whole room
    io.to(toSocketId).emit('signal', { fromSocketId: socket.id, payload })
  })

  socket.on('disconnect', () => {
    const { linkId, role } = socket.data || {}
    if (linkId) socket.to(linkId).emit('peer-left', { socketId: socket.id, role })
    console.log('Disconnected:', socket.id)
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001

server.listen(PORT, '0.0.0.0', () =>
  console.log(`Internet signaling server on :${PORT}`)
)

function shutdown(sig) {
  console.log(`\n${sig} — shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
