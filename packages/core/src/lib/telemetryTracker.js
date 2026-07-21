/**
 * telemetryTracker.js
 *
 * The actual per-transfer bookkeeping — plain closures, not a React hook.
 * Safe to call anywhere: inside a loop, inside an event handler, once per
 * receiver in a fan-out sender. useTelemetry.js wraps this in a useRef for
 * the simple 1:1 case (a single hook instance = a single transfer); sender
 * hooks that support multiple concurrent receivers (peersRef Maps) should
 * call this directly, once per receiver, instead of using the hook.
 *
 * Why this had to be split out: a React hook holds ONE set of refs for its
 * whole lifetime. A sender with 3 concurrent receivers needs 3 independent
 * trackers — one shared instance corrupts connection time, chunk counts,
 * and per-file timings across receivers, and only the first receiver to
 * finish ever gets its beacon sent (finalise() clears the shared beacon
 * after its first call).
 */
import { createMetricsBeacon } from './metricsBeacon'

const METRICS_ENDPOINT = typeof import.meta !== 'undefined'
  ? (import.meta.env?.VITE_METRICS_ENDPOINT ?? '')
  : ''

/**
 * crypto.randomUUID() requires a secure context (HTTPS, or localhost) —
 * per spec it's simply not a function at all when the page is served over
 * plain HTTP. crypto.getRandomValues() has no such restriction, so this
 * falls back to building a UUID v4 from it manually, with a last-resort
 * Math.random() fallback for anything stranger still. A transferId only
 * needs to be unique, never cryptographically unpredictable, so this
 * fallback is fine to use even when it's not the primary path.
 */
function safeUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

/**
 * Telemetry exists to observe transfers, never to affect them — every
 * exported function here is wrapped so an internal failure (missing
 * browser API, unexpected null, anything) can only ever produce a console
 * warning, never an uncaught exception. Without this, onSessionCreate()
 * throwing synchronously during a render/effect would unmount the entire
 * page (React has no default error boundary) over what should be a
 * strictly best-effort side channel.
 */
function guard(name, fn, fallback = undefined) {
  return (...args) => {
    try {
      return fn(...args)
    } catch (e) {
      console.warn(`[telemetry] ${name} failed (ignored):`, e)
      return fallback
    }
  }
}

/**
 * @param {{ mode: 'internet'|'lan', role: 'sender'|'receiver' }} options
 */
export function createTelemetryTracker({ mode, role }) {
  let sessionStart    = null
  let channelOpen     = null
  let transferStart   = null

  let pauseCount      = 0
  let pauseTotalMs    = 0
  let pauseStart      = null
  let chunkCount      = 0

  const fileTimings   = new Map()
  let pc              = null
  let beacon          = null

  function onSessionCreate() {
    sessionStart  = Date.now()
    pauseCount    = 0
    pauseTotalMs  = 0
    chunkCount    = 0
    fileTimings.clear()
    transferStart = null
    channelOpen   = null

    if (METRICS_ENDPOINT) {
      beacon = createMetricsBeacon({
        transferId: safeUUID(),
        mode, role,
        endpoint: METRICS_ENDPOINT,
      })
    }
  }

  function onChannelOpen(peerConnection) {
    channelOpen   = Date.now()
    transferStart = Date.now()
    pc            = peerConnection
  }

  function onFileStart(index, size) {
    fileTimings.set(index, { start: Date.now(), end: null, size })
  }

  function onChunk() {
    chunkCount += 1
  }

  function onFileEnd(index) {
    const entry = fileTimings.get(index)
    if (entry) entry.end = Date.now()
  }

  function onPauseStart() {
    pauseCount += 1
    pauseStart  = performance.now()
  }

  function onPauseEnd() {
    if (pauseStart !== null) {
      pauseTotalMs += performance.now() - pauseStart
      pauseStart    = null
    }
  }

  async function getWebRTCStats() {
    if (!pc) return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
    try {
      const stats = await pc.getStats()
      let rttMs = null, bitrate = null, sctpSent = null
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime != null) rttMs   = Math.round(report.currentRoundTripTime * 1000)
          if (report.availableOutgoingBitrate != null) bitrate = Math.round(report.availableOutgoingBitrate)
        }
        if (report.type === 'data-channel') {
          if (role === 'sender'   && report.bytesSent     != null) sctpSent = report.bytesSent
          if (role === 'receiver' && report.bytesReceived != null) sctpSent = report.bytesReceived
        }
      })
      return { rttMs, availableBitrate: bitrate, sctpBytesSent: sctpSent }
    } catch {
      return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
    }
  }

  async function finalise(summary) {
    try {
      const end        = Date.now()
      const start       = transferStart ?? end
      const durationMs  = end - start
      const connMs      = channelOpen && sessionStart ? channelOpen - sessionStart : null
      const avgSpeedBps = durationMs > 0 ? Math.round((summary.totalBytes / durationMs) * 1000) : 0

      const files = (summary.fileList || []).map((f, i) => {
        const t          = fileTimings.get(i)
        const fileDurMs   = t?.start && t?.end ? t.end - t.start : 0
        const fileAvgBps  = fileDurMs > 0 ? Math.round((f.size / fileDurMs) * 1000) : 0
        return { path: f.path, size: f.size, status: f.status || 'done', durationMs: fileDurMs, avgSpeedBps: fileAvgBps }
      })

      const webrtc = await getWebRTCStats()

      const record = {
        id: safeUUID(),
        mode, role,
        timestamp:           new Date().toISOString(),
        outcome:             summary.outcome || 'done',
        connectionMs:        connMs,
        totalBytes:          summary.totalBytes,
        durationMs,
        avgSpeedBps,
        peakSpeedBps:        summary.peakSpeedBps,
        speedSamples:        summary.speedSamples || [],
        chunkCount,
        backpressurePauses:  pauseCount,
        backpressureTotalMs: Math.round(pauseTotalMs),
        rttMs:               webrtc.rttMs,
        availableBitrate:    webrtc.availableBitrate,
        sctpBytesSent:       webrtc.sctpBytesSent,
        files,
      }

      beacon?.send(summary.outcome || 'done', record)
      beacon = null

      return record
    } catch (e) {
      console.warn('[telemetry] finalise failed (ignored):', e)
      return null
    }
  }

  return {
    onSessionCreate: guard('onSessionCreate', onSessionCreate),
    onChannelOpen:   guard('onChannelOpen', onChannelOpen),
    onFileStart:     guard('onFileStart', onFileStart),
    onChunk:         guard('onChunk', onChunk),
    onFileEnd:       guard('onFileEnd', onFileEnd),
    onPauseStart:    guard('onPauseStart', onPauseStart),
    onPauseEnd:      guard('onPauseEnd', onPauseEnd),
    finalise,   // already self-guarded above (it's async — guard() wouldn't catch a rejected promise)
  }
}
