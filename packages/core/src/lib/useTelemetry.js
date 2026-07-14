/**
 * useTelemetry.js — v2
 *
 * Adds live metrics streaming via metricsBeacon (sendBeacon → /api/metrics
 * → InfluxDB → Grafana) alongside the existing IndexedDB persistence.
 *
 * Beacon is completely optional — if VITE_METRICS_ENDPOINT is not set,
 * only IndexedDB recording happens. The transfer is unaffected either way.
 *
 * Hot-path cost: unchanged — plain ref mutations only.
 * Beacon cost: one sendBeacon (background thread) every 2s. Zero impact
 * on the WebRTC DataChannel path.
 */
import { useRef, useCallback } from 'react'
import { saveTransfer }         from './transferDB'
import { createMetricsBeacon }  from './metricsBeacon'

/** Read once at module load — no re-reads needed */
const METRICS_ENDPOINT = typeof import.meta !== 'undefined'
  ? (import.meta.env?.VITE_METRICS_ENDPOINT ?? '')
  : ''

/**
 * @param {{ mode: 'internet'|'lan', role: 'sender'|'receiver' }} options
 */
export function useTelemetry({ mode, role }) {
  const sessionStartRef    = useRef(null)
  const channelOpenRef     = useRef(null)
  const transferStartRef   = useRef(null)
  const transferEndRef     = useRef(null)

  const pauseCountRef      = useRef(0)
  const pauseTotalMsRef    = useRef(0)
  const pauseStartRef      = useRef(null)
  const chunkCountRef      = useRef(0)

  const fileTimingsRef     = useRef(new Map())
  const pcRef              = useRef(null)

  // Live metrics beacon — created on session start if endpoint is configured
  const beaconRef          = useRef(null)

  // Latest cumulative values for beacon — updated on each chunk, read on flush
  const liveRef = useRef({ bytesSent: 0, speedBps: 0 })

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  const onSessionCreate = useCallback(() => {
    sessionStartRef.current  = Date.now()
    pauseCountRef.current    = 0
    pauseTotalMsRef.current  = 0
    chunkCountRef.current    = 0
    fileTimingsRef.current   = new Map()
    transferStartRef.current = null
    transferEndRef.current   = null
    channelOpenRef.current   = null
    liveRef.current          = { bytesSent: 0, speedBps: 0 }

    if (METRICS_ENDPOINT) {
      const transferId = crypto.randomUUID()
      beaconRef.current = createMetricsBeacon({
        transferId,
        mode,
        role,
        endpoint: METRICS_ENDPOINT,
        flushIntervalMs: 2000,  // batch 8 x 250ms samples per POST
      })
    }
  }, [mode, role])

  const onChannelOpen = useCallback((pc) => {
    channelOpenRef.current   = Date.now()
    transferStartRef.current = Date.now()
    pcRef.current            = pc
    beaconRef.current?.start()   // begin the 2s flush timer
  }, [])

  // ── Engine callbacks (hot path) — ref mutations only ─────────────────────

  const onFileStart = useCallback((index, size) => {
    fileTimingsRef.current.set(index, { start: Date.now(), end: null, size })
  }, [])

  const onChunk = useCallback(() => {
    chunkCountRef.current += 1
  }, [])

  const onFileEnd = useCallback((index) => {
    const entry = fileTimingsRef.current.get(index)
    if (entry) entry.end = Date.now()
  }, [])

  // ── Backpressure (outside hot path — only fires when stalling) ────────────

  const onPauseStart = useCallback(() => {
    pauseCountRef.current += 1
    pauseStartRef.current  = performance.now()
  }, [])

  const onPauseEnd = useCallback(() => {
    if (pauseStartRef.current !== null) {
      pauseTotalMsRef.current += performance.now() - pauseStartRef.current
      pauseStartRef.current    = null
    }
  }, [])

  /**
   * Called by the speed-sampling code in the sender/receiver hook,
   * at the same 250ms rate as useSpeedTracker — already throttled,
   * already outside the hot chunk loop.
   *
   * The beacon doesn't POST here — it just records the sample into
   * its ring buffer. The actual POST happens on the 2s interval timer.
   */
  const onSpeedSample = useCallback((bytesSent, speedBps) => {
    liveRef.current = { bytesSent, speedBps }
    beaconRef.current?.record({
      bytesSent,
      speedBps,
      backpressurePauses: pauseCountRef.current,
      chunkCount:         chunkCountRef.current,
    })
  }, [])

  // ── WebRTC stats ──────────────────────────────────────────────────────────

  async function getWebRTCStats() {
    const pc = pcRef.current
    if (!pc) return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
    try {
      const stats  = await pc.getStats()
      let rttMs = null, bitrate = null, sctpSent = null
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime != null)
            rttMs   = Math.round(report.currentRoundTripTime * 1000)
          if (report.availableOutgoingBitrate != null)
            bitrate = Math.round(report.availableOutgoingBitrate)
        }
        if (report.type === 'data-channel') {
          if (report.bytesSent     != null) sctpSent = report.bytesSent
          if (report.bytesReceived != null) sctpSent = report.bytesReceived
        }
      })
      return { rttMs, availableBitrate: bitrate, sctpBytesSent: sctpSent }
    } catch {
      return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
    }
  }

  // ── Finalise ──────────────────────────────────────────────────────────────

  const finalise = useCallback(async (summary) => {
    const end        = Date.now()
    transferEndRef.current = end
    const start      = transferStartRef.current ?? end
    const durationMs = end - start
    const connMs     = channelOpenRef.current && sessionStartRef.current
      ? channelOpenRef.current - sessionStartRef.current : null
    const avgSpeedBps = durationMs > 0
      ? Math.round((summary.totalBytes / durationMs) * 1000) : 0

    const files = (summary.fileList || []).map((f, i) => {
      const t          = fileTimingsRef.current.get(i)
      const fileDurMs  = t?.start && t?.end ? t.end - t.start : 0
      const fileAvgBps = fileDurMs > 0
        ? Math.round((f.size / fileDurMs) * 1000) : 0
      return { path: f.path, size: f.size, status: f.status || 'done', durationMs: fileDurMs, avgSpeedBps: fileAvgBps }
    })

    const webrtc = await getWebRTCStats()

    const record = {
      id:                  crypto.randomUUID(),
      mode, role,
      timestamp:           new Date().toISOString(),
      outcome:             summary.outcome || 'done',
      connectionMs:        connMs,
      totalBytes:          summary.totalBytes,
      durationMs,
      avgSpeedBps,
      peakSpeedBps:        summary.peakSpeedBps,
      speedSamples:        summary.speedSamples || [],
      chunkCount:          chunkCountRef.current,
      backpressurePauses:  pauseCountRef.current,
      backpressureTotalMs: Math.round(pauseTotalMsRef.current),
      rttMs:               webrtc.rttMs,
      availableBitrate:    webrtc.availableBitrate,
      sctpBytesSent:       webrtc.sctpBytesSent,
      files,
    }

    // Stop the beacon timer and send the final flush with outcome
    beaconRef.current?.stop(summary.outcome || 'done')
    console.log("From teletry: ",record);
    beaconRef.current = null

    // Persist to IndexedDB (async, fire-and-forget)
    await saveTransfer(record)
    return record
  }, [mode, role])

  return {
    onSessionCreate, onChannelOpen,
    onFileStart, onChunk, onFileEnd,
    onPauseStart, onPauseEnd,
    onSpeedSample,   // ← new: call from the 250ms speed-sample branch
    finalise,
  }
}





// /**
//  * useTelemetry.js — v2
//  *
//  * Adds live metrics streaming via metricsBeacon (sendBeacon → /api/metrics
//  * → InfluxDB → Grafana) alongside the existing IndexedDB persistence.
//  *
//  * Beacon is completely optional — if VITE_METRICS_ENDPOINT is not set,
//  * only IndexedDB recording happens. The transfer is unaffected either way.
//  *
//  * Hot-path cost: unchanged — plain ref mutations only.
//  * Beacon cost: one sendBeacon (background thread) every 2s. Zero impact
//  * on the WebRTC DataChannel path.
//  */
// import { useRef, useCallback } from 'react'
// import { saveTransfer }         from './transferDB'
// import { createMetricsBeacon }  from './metricsBeacon'

// /** Read once at module load — no re-reads needed */
// const METRICS_ENDPOINT = typeof import.meta !== 'undefined'
//   ? (import.meta.env?.VITE_METRICS_ENDPOINT ?? '')
//   : ''

// /**
//  * @param {{ mode: 'internet'|'lan', role: 'sender'|'receiver' }} options
//  */
// export function useTelemetry({ mode, role }) {
//   const sessionStartRef    = useRef(null)
//   const channelOpenRef     = useRef(null)
//   const transferStartRef   = useRef(null)
//   const transferEndRef     = useRef(null)

//   const pauseCountRef      = useRef(0)
//   const pauseTotalMsRef    = useRef(0)
//   const pauseStartRef      = useRef(null)
//   const chunkCountRef      = useRef(0)

//   const fileTimingsRef     = useRef(new Map())
//   const pcRef              = useRef(null)

//   // Live metrics beacon — created on session start if endpoint is configured
//   const beaconRef          = useRef(null)

//   // Latest cumulative values for beacon — updated on each chunk, read on flush
//   const liveRef = useRef({ bytesSent: 0, speedBps: 0 })

//   // ── Lifecycle ─────────────────────────────────────────────────────────────

//   const onSessionCreate = useCallback(() => {
//     sessionStartRef.current  = Date.now()
//     pauseCountRef.current    = 0
//     pauseTotalMsRef.current  = 0
//     chunkCountRef.current    = 0
//     fileTimingsRef.current   = new Map()
//     transferStartRef.current = null
//     transferEndRef.current   = null
//     channelOpenRef.current   = null
//     liveRef.current          = { bytesSent: 0, speedBps: 0 }

//     if (METRICS_ENDPOINT) {
//       const transferId = crypto.randomUUID()
//       beaconRef.current = createMetricsBeacon({
//         transferId,
//         mode,
//         role,
//         endpoint: METRICS_ENDPOINT,
//         flushIntervalMs: 2000,  // batch 8 x 250ms samples per POST
//       })
//     }
//   }, [mode, role])

//   const onChannelOpen = useCallback((pc) => {
//     channelOpenRef.current   = Date.now()
//     transferStartRef.current = Date.now()
//     pcRef.current            = pc
//     beaconRef.current?.start()   // begin the 2s flush timer
//   }, [])

//   // ── Engine callbacks (hot path) — ref mutations only ─────────────────────

//   const onFileStart = useCallback((index, size) => {
//     fileTimingsRef.current.set(index, { start: Date.now(), end: null, size })
//   }, [])

//   const onChunk = useCallback(() => {
//     chunkCountRef.current += 1
//   }, [])

//   const onFileEnd = useCallback((index) => {
//     const entry = fileTimingsRef.current.get(index)
//     if (entry) entry.end = Date.now()
//   }, [])

//   // ── Backpressure (outside hot path — only fires when stalling) ────────────

//   const onPauseStart = useCallback(() => {
//     pauseCountRef.current += 1
//     pauseStartRef.current  = performance.now()
//   }, [])

//   const onPauseEnd = useCallback(() => {
//     if (pauseStartRef.current !== null) {
//       pauseTotalMsRef.current += performance.now() - pauseStartRef.current
//       pauseStartRef.current    = null
//     }
//   }, [])

//   /**
//    * Called by the speed-sampling code in the sender/receiver hook,
//    * at the same 250ms rate as useSpeedTracker — already throttled,
//    * already outside the hot chunk loop.
//    *
//    * The beacon doesn't POST here — it just records the sample into
//    * its ring buffer. The actual POST happens on the 2s interval timer.
//    */
//   const onSpeedSample = useCallback((bytesSent, speedBps) => {
//     liveRef.current = { bytesSent, speedBps }
//     beaconRef.current?.record({
//       bytesSent,
//       speedBps,
//       backpressurePauses: pauseCountRef.current,
//       chunkCount:         chunkCountRef.current,
//     })
//   }, [])

//   // ── WebRTC stats ──────────────────────────────────────────────────────────

//   async function getWebRTCStats() {
//     const pc = pcRef.current
//     if (!pc) return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
//     try {
//       const stats  = await pc.getStats()
//       let rttMs = null, bitrate = null, sctpSent = null
//       stats.forEach((report) => {
//         if (report.type === 'candidate-pair' && report.state === 'succeeded') {
//           if (report.currentRoundTripTime != null)
//             rttMs   = Math.round(report.currentRoundTripTime * 1000)
//           if (report.availableOutgoingBitrate != null)
//             bitrate = Math.round(report.availableOutgoingBitrate)
//         }
//         if (report.type === 'data-channel') {
//           if (report.bytesSent     != null) sctpSent = report.bytesSent
//           if (report.bytesReceived != null) sctpSent = report.bytesReceived
//         }
//       })
//       return { rttMs, availableBitrate: bitrate, sctpBytesSent: sctpSent }
//     } catch {
//       return { rttMs: null, availableBitrate: null, sctpBytesSent: null }
//     }
//   }

//   // ── Finalise ──────────────────────────────────────────────────────────────

//   const finalise = useCallback(async (summary) => {
//     const end        = Date.now()
//     transferEndRef.current = end
//     const start      = transferStartRef.current ?? end
//     const durationMs = end - start
//     const connMs     = channelOpenRef.current && sessionStartRef.current
//       ? channelOpenRef.current - sessionStartRef.current : null
//     const avgSpeedBps = durationMs > 0
//       ? Math.round((summary.totalBytes / durationMs) * 1000) : 0

//     const files = (summary.fileList || []).map((f, i) => {
//       const t          = fileTimingsRef.current.get(i)
//       const fileDurMs  = t?.start && t?.end ? t.end - t.start : 0
//       const fileAvgBps = fileDurMs > 0
//         ? Math.round((f.size / fileDurMs) * 1000) : 0
//       return { path: f.path, size: f.size, status: f.status || 'done', durationMs: fileDurMs, avgSpeedBps: fileAvgBps }
//     })

//     const webrtc = await getWebRTCStats()

//     const record = {
//       id:                  crypto.randomUUID(),
//       mode, role,
//       timestamp:           new Date().toISOString(),
//       outcome:             summary.outcome || 'done',
//       connectionMs:        connMs,
//       totalBytes:          summary.totalBytes,
//       durationMs,
//       avgSpeedBps,
//       peakSpeedBps:        summary.peakSpeedBps,
//       speedSamples:        summary.speedSamples || [],
//       chunkCount:          chunkCountRef.current,
//       backpressurePauses:  pauseCountRef.current,
//       backpressureTotalMs: Math.round(pauseTotalMsRef.current),
//       rttMs:               webrtc.rttMs,
//       availableBitrate:    webrtc.availableBitrate,
//       sctpBytesSent:       webrtc.sctpBytesSent,
//       files,
//     }

//     // Stop the beacon timer and send the final flush with outcome
//     beaconRef.current?.stop(summary.outcome || 'done')
//     beaconRef.current = null

//     // Persist to IndexedDB (async, fire-and-forget)
//     await saveTransfer(record)
//     return record
//   }, [mode, role])

//   return {
//     onSessionCreate, onChannelOpen,
//     onFileStart, onChunk, onFileEnd,
//     onPauseStart, onPauseEnd,
//     onSpeedSample,   // ← new: call from the 250ms speed-sample branch
//     finalise,
//   }
// }