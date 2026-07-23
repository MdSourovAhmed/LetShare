/**
 * metricsBeacon.js — single-shot, post-transfer metrics send
 *
 * Sends exactly one POST, once, after the transfer finishes (success,
 * cancel, or error) — never during the transfer. There is no timer, no
 * buffering, no per-chunk hook of any kind, so there is nothing here that
 * can run on, or compete with, the WebRTC DataChannel path.
 *
 * sendBeacon() is fire-and-forget: the browser queues the POST on a
 * background thread and returns immediately — no Promise to await, no
 * response to parse, and it still fires even if the tab is being closed
 * right after a transfer completes.
 *
 * Usage:
 *   const beacon = createMetricsBeacon({ transferId, mode, role, endpoint })
 *   beacon.send(outcome, summary)   // called once, from finalise()
 */

/**
 * @param {{
 *   transferId: string,
 *   mode:       'internet'|'lan',
 *   role:       'sender'|'receiver',
 *   endpoint:   string,   // e.g. '/api/metrics'
 * }} options
 */
export function createMetricsBeacon({ transferId, mode, role, endpoint }) {
  function send(outcome, summary) {
    const payload = JSON.stringify({ transferId, mode, role, outcome, summary })

    const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))

    // Fallback: if sendBeacon fails (payload too large, browser quirk), use
    // fetch with keepalive so the request still survives page unload.
    if (!sent) {
      fetch(endpoint, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      payload,
        keepalive: true,
      }).catch(() => {})   // metrics are advisory — never let a failure surface
    }
  }

  return { send }
}
