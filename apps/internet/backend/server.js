// // import express          from 'express'
// // import { createServer } from 'http'
// // import { Server }       from 'socket.io'
// // import path             from 'path'
// // import                       'dotenv/config'

// // const app    = express()
// // const server = createServer(app)

// // const io = new Server(server, {
// //   cors: {
// //     origin: process.env.CORS_ORIGIN || '*',
// //     methods: ['GET', 'POST'],
// //   },
// //   maxHttpBufferSize: 1e8,
// // })

// // // ── Health check ──────────────────────────────────────────────────────────────
// // app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'internet' }))

// // // ── Static frontend (production) ──────────────────────────────────────────────
// // const __dirname = path.resolve()
// // app.use(express.static(path.join(__dirname, '../frontend/dist')))
// // app.get('/{*splat}', (_req, res) =>
// //   res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
// // )

// // // ── Signaling ─────────────────────────────────────────────────────────────────
// // io.on('connection', (socket) => {
// //   console.log('Connected:', socket.id)

// //   socket.on('join', ({ linkId, role } = {}) => {
// //     if (!linkId || !role) return
// //     socket.join(linkId)
// //     socket.data = { linkId, role }
// //     // Include socketId so sender can open a dedicated RTCPeerConnection per receiver
// //     socket.to(linkId).emit('peer-joined', { socketId: socket.id, role })
// //   })

// //   socket.on('signal', ({ linkId, toSocketId, payload } = {}) => {
// //     if (!linkId || !toSocketId || !payload) return
// //     // Route directly to one peer — never broadcast to whole room
// //     io.to(toSocketId).emit('signal', { fromSocketId: socket.id, payload })
// //   })

// //   socket.on('disconnect', () => {
// //     const { linkId, role } = socket.data || {}
// //     if (linkId) socket.to(linkId).emit('peer-left', { socketId: socket.id, role })
// //     console.log('Disconnected:', socket.id)
// //   })
// // })

// // // ── Start ─────────────────────────────────────────────────────────────────────
// // const PORT = process.env.PORT || 3001

// // server.listen(PORT, '0.0.0.0', () =>
// //   console.log(`Internet signaling server on :${PORT}`)
// // )

// // function shutdown(sig) {
// //   console.log(`\n${sig} — shutting down`)
// //   server.close(() => process.exit(0))
// //   setTimeout(() => process.exit(1), 5000).unref()
// // }
// // process.on('SIGTERM', () => shutdown('SIGTERM'))
// // process.on('SIGINT',  () => shutdown('SIGINT'))




// import 'dotenv/config'
// import express          from 'express'
// import { createServer } from 'http'
// import { Server }       from 'socket.io'
// import { fileURLToPath } from 'node:url'
// import path             from 'path'
// import { writeMetrics } from '../../../packages/core/src/lib/metricsWriter.js'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname  = path.dirname(__filename)

// const app    = express()
// const server = createServer(app)

// const io = new Server(server, {
//   cors: {
//     origin:  process.env.CORS_ORIGIN || '*',
//     methods: ['GET', 'POST'],
//   },
//   maxHttpBufferSize: 1e8,
// })

// // ── Body parsing (needed for /api/metrics) ────────────────────────────────────
// app.use(express.json({ limit: '64kb' }))

// // ── Health check ──────────────────────────────────────────────────────────────
// app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'internet' }))

// // ── Metrics endpoint ──────────────────────────────────────────────────────────
// // Receives sendBeacon payloads from the browser (batched every 2s).
// // Writes to InfluxDB via metricsWriter. Never blocks — failures are swallowed.
// // The 204 response is sent before the InfluxDB write completes so the
// // browser's sendBeacon call is acknowledged immediately.
// app.post('/api/metrics', (req, res) => {
//   console.log(req.body);
//   res.sendStatus(204)                    // respond immediately — no body needed
//   writeMetrics(req.body).catch(() => {}) // async, fire-and-forget
// })

// // ── Static frontend (production) ──────────────────────────────────────────────
// app.use(express.static(path.join(__dirname, '../frontend/dist')))
// app.use((req, res, next) => {
//   // Only fall back to index.html for non-API, non-socket routes
//   if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next()
//   res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
// })

// // ── Signaling ─────────────────────────────────────────────────────────────────
// io.on('connection', (socket) => {
//   console.log('Connected:', socket.id)

//   socket.on('join', ({ linkId, role } = {}) => {
//     if (!linkId || !role) return
//     socket.join(linkId)
//     socket.data = { linkId, role }
//     socket.to(linkId).emit('peer-joined', { socketId: socket.id, role })
//   })

//   socket.on('signal', ({ linkId, toSocketId, payload } = {}) => {
//     if (!linkId || !toSocketId || !payload) return
//     io.to(toSocketId).emit('signal', { fromSocketId: socket.id, payload })
//   })

//   socket.on('disconnect', () => {
//     const { linkId, role } = socket.data || {}
//     if (linkId) socket.to(linkId).emit('peer-left', { socketId: socket.id, role })
//     console.log('Disconnected:', socket.id)
//   })
// })

// // ── Start ─────────────────────────────────────────────────────────────────────
// const PORT = process.env.PORT || 3001

// server.listen(PORT, '0.0.0.0', () =>
//   console.log(`Internet signaling server on :${PORT}`)
// )

// function shutdown(sig) {
//   console.log(`\n${sig} — shutting down`)
//   server.close(() => process.exit(0))
//   setTimeout(() => process.exit(1), 5000).unref()
// }
// process.on('SIGTERM', () => shutdown('SIGTERM'))
// process.on('SIGINT',  () => shutdown('SIGINT'))





import 'dotenv/config'
import express          from 'express'
import { createServer } from 'http'
import { Server }       from 'socket.io'
import { fileURLToPath } from 'node:url'
import path             from 'path'
import { writeMetrics } from '../../../packages/core/src/lib/metricsWriter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app    = express()
const server = createServer(app)

const io = new Server(server, {
  cors: {
    origin:  process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
})

// ── Body parsing (needed for /api/metrics) ────────────────────────────────────
app.use(express.json({ limit: '64kb' }))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'internet' }))

// ── Metrics endpoint ──────────────────────────────────────────────────────────
// Receives exactly one sendBeacon payload per transfer, sent once the
// transfer is done (success, cancel, or error) — never during it.
// Writes to InfluxDB via metricsWriter. Never blocks — failures are swallowed.
// The 204 response is sent before the InfluxDB write completes so the
// browser's sendBeacon call is acknowledged immediately.
app.post('/api/metrics', (req, res) => {
  res.sendStatus(204)                    // respond immediately — no body needed
  writeMetrics(req.body).catch(() => {}) // async, fire-and-forget
})

// ── Static frontend (production) ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/dist')))
app.use((req, res, next) => {
  // Only fall back to index.html for non-API, non-socket routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
})

// ── Signaling ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id)

  socket.on('join', ({ linkId, role } = {}) => {
    if (!linkId || !role) return
    socket.join(linkId)
    socket.data = { linkId, role }
    socket.to(linkId).emit('peer-joined', { socketId: socket.id, role })
  })

  socket.on('signal', ({ linkId, toSocketId, payload } = {}) => {
    if (!linkId || !toSocketId || !payload) return
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