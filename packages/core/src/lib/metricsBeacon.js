/**
 * metricsBeacon.js — zero-transfer-impact live metrics pipeline
 *
 * Design rationale (why sendBeacon + 2s batching, not fetch every 250ms):
 *
 * 1. sendBeacon() is fire-and-forget. The browser queues the POST on a
 *    background thread — no main-thread wait, no Promise, no response to
 *    parse. This is literally what the API was designed for.
 *
 * 2. Batching to 2s (8 samples per POST vs 1) reduces HTTP round-trips by
 *    8x. Fewer round-trips = fewer times the OS network stack competes with
 *    the WebRTC SCTP path. On a shared WiFi link this actually matters.
 *
 * 3. Collection (ring buffer push) is synchronous and cheap — a single
 *    array.push() per 250ms sample. The 2s flush timer is completely
 *    decoupled from the 250ms speed-sampling window and from the chunk loop.
 *
 * 4. If the beacon fails (network hiccup, server down), the transfer is
 *    completely unaffected — metrics are advisory, never blocking.
 *
 * 5. The 64 KB sendBeacon payload cap is never approached: a batch of 8
 *    samples is ~400 bytes of JSON encoded as URLSearchParams.
 *
 * Usage:
 *   const beacon = createMetricsBeacon({ transferId, mode, role, endpoint })
 *   beacon.record({ bytesSent, speedBps, backpressurePauses, chunkCount })
 *   beacon.flush()   // called automatically every 2s; call manually on done
 *   beacon.stop()    // clears the flush timer
 */

/**
 * @param {{
 *   transferId:         string,
 *   mode:               'internet'|'lan',
 *   role:               'sender'|'receiver',
 *   endpoint:           string,    // e.g. '/api/metrics'
 *   flushIntervalMs?:   number,    // default 2000
 * }} options
 */
export function createMetricsBeacon({ transferId, mode, role, endpoint, flushIntervalMs = 2000 }) {
  // Ring buffer — accumulates samples between flushes
  // Plain array, no React state, no re-renders
  const buffer = []

  let timer         = null
  let totalBytes    = 0    // monotonically increasing — sent with each sample
  let startedAt     = null

  function record({ bytesSent, speedBps, backpressurePauses, chunkCount }) {
    if (startedAt === null) startedAt = Date.now()
    totalBytes = bytesSent   // always the latest cumulative value

    buffer.push({
      ts:                 Date.now(),
      bytesSent,
      speedBps:           speedBps           ?? 0,
      backpressurePauses: backpressurePauses ?? 0,
      chunkCount:         chunkCount         ?? 0,
    })
  }

  function flush(outcome = 'progress') {
    if (!buffer.length && outcome === 'progress') return

    const payload = JSON.stringify({
      transferId,
      mode,
      role,
      outcome,
      totalBytes,
      startedAt,
      samples: buffer.splice(0),   // drain and return all buffered samples
    })

    // sendBeacon: fire-and-forget, background thread, survives page unload
    const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))

    // Fallback: if sendBeacon fails (e.g. payload too large — shouldn't happen),
    // use fetch with keepalive so the request survives page unload too.
    if (!sent) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    payload,
        keepalive: true,
      }).catch(() => {})   // silently ignore — metrics are never critical
    }
  }

  function start() {
    if (timer) return
    timer = setInterval(() => flush('progress'), flushIntervalMs)
  }

  function stop(outcome = 'done') {
    if (timer) { clearInterval(timer); timer = null }
    flush(outcome)   // final flush with outcome tag
  }

  return { record, start, stop, flush }
}