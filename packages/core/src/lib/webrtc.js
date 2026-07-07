// // export const RTC_CONFIG = {
// //   iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
// // }
// // export const CHUNK_SIZE         = 64 * 1024
// // export const BUFFER_LOW         = 512 * 1024
// // export const CONNECT_TIMEOUT_MS = 45_000



// /**
//  * WebRTC transfer tuning — v2 (optimized)
//  *
//  * v1 used a single conservative profile (64 KB chunks, 512 KB buffer,
//  * 10ms backpressure polling) for both Internet and LAN transfers.
//  * That profile was tuned for "always works", not "fast".
//  *
//  * v2 introduces two profiles. LAN has near-zero RTT and very high bandwidth
//  * (100 Mbps–10 Gbps typical), so it can push much larger chunks and a much
//  * deeper send buffer before backpressure kicks in. Internet transfers cross
//  * real-world links with higher RTT and possible packet loss, so the profile
//  * stays larger than v1 but more conservative than LAN.
//  *
//  * Tune these per-deployment if you know your users' typical network — e.g.
//  * raise INTERNET further if most users are on fiber, lower it for mobile-heavy
//  * audiences.
//  */

// export const RTC_CONFIG = {
//   iceServers: [
//     { urls: ['stun:stun.l.google.com:19302'] },
//     { urls: ['stun:stun1.l.google.com:19302'] },
//     // Add a TURN server here for production Internet-mode reliability behind
//     // symmetric NATs / restrictive firewalls, where direct P2P cannot connect:
//     // { urls: 'turn:your-turn-server:3478', username: '...', credential: '...' },
//   ],
//   // Pre-gather ICE candidates more aggressively — reduces connection setup time
//   iceCandidatePoolSize: 4,
// }

// /**
//  * Data channel config per transfer context.
//  *
//  * ordered: false + maxRetransmits unset means "unreliable but unordered" is
//  * NOT what we want — we need reliable delivery (files must arrive intact),
//  * but we don't need IN-ORDER delivery, because every chunk carries an
//  * implicit offset via the sequential write the receiver performs per file.
//  * Actually: for whole-file integrity we keep `ordered: true` per data channel
//  * (one channel = one peer = strictly sequential file stream), but we widen
//  * buffers and chunk sizes so the *channel* spends less time blocked.
//  */
// export const DC_CONFIG = { ordered: true }

// // ── Chunk size ─────────────────────────────────────────────────────────────
// // v1: 64 KB flat for everyone.
// // v2: profile-based. LAN can sustain much larger chunks because RTT is
// // near-zero and the SCTP congestion window opens up fast on a local link.
// export const CHUNK_SIZE_LAN      = 256 * 1024   // 256 KB — LAN profile
// export const CHUNK_SIZE_INTERNET = 128 * 1024   // 128 KB — Internet profile (was 64 KB)

// // ── Backpressure thresholds ───────────────────────────────────────────────
// // v1: BUFFER_LOW = 512 KB, polled every 10ms via setTimeout.
// // v2: much larger high-water mark so the channel's send buffer stays full
// // (fewer stalls waiting for drain), and we use the native 'bufferedamountlow'
// // EVENT instead of polling — zero busy-wait overhead.
// export const BUFFER_HIGH_LAN      = 4 * 1024 * 1024  // 16 MB — pause sending above this
// export const BUFFER_LOW_LAN       = 1  * 1024 * 1024  // 4 MB  — resume below this (channel's threshold)
// export const BUFFER_HIGH_INTERNET = 8  * 1024 * 1024  // 8 MB
// export const BUFFER_LOW_INTERNET  = 2  * 1024 * 1024  // 2 MB

// // ── Read-ahead pipelining ─────────────────────────────────────────────────
// // Number of chunks to read from disk/Blob concurrently, ahead of the chunk
// // currently being sent. Overlaps I/O latency with network send time instead
// // of doing them strictly serially (v1 behaviour).
// export const READ_AHEAD_DEPTH = 4

// // ── Backward-compatible aliases (so existing imports don't break) ────────
// // Default to the Internet profile if a consumer imports the old flat names.
// export const CHUNK_SIZE = CHUNK_SIZE_INTERNET
// export const BUFFER_LOW = BUFFER_LOW_INTERNET

// export const CONNECT_TIMEOUT_MS = 45_000

// /**
//  * Returns the appropriate transfer profile for a given context.
//  * @param {'lan'|'internet'} context
//  */
// export function getTransferProfile(context = 'internet') {
//   if (context === 'lan') {
//     return {
//       chunkSize:  CHUNK_SIZE_LAN,
//       bufferHigh: BUFFER_HIGH_LAN,
//       bufferLow:  BUFFER_LOW_LAN,
//       readAhead:  READ_AHEAD_DEPTH,
//     }
//   }
//   return {
//     chunkSize:  CHUNK_SIZE_INTERNET,
//     bufferHigh: BUFFER_HIGH_INTERNET,
//     bufferLow:  BUFFER_LOW_INTERNET,
//     readAhead:  READ_AHEAD_DEPTH,
//   }
// }





/**
 * WebRTC transfer tuning — v2.1
 *
 * Profile values below are conservative-by-default to work across a wide
 * range of hardware and browsers. Explanation of each constant follows.
 */

export const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
    // TURN server for production Internet-mode reliability:
    // { urls: 'turn:your-turn-server:3478', username: '...', credential: '...' },
  ],
  iceCandidatePoolSize: 4,
}

export const DC_CONFIG = { ordered: true }

// ── Chunk size ──────────────────────────────────────────────────────────────
// Larger chunks = fewer JS event-loop round-trips per byte = higher throughput.
// But a chunk must fit within one SCTP packet batch — going above 256 KB
// gives diminishing returns and increases the chance of a single-chunk stall.
// LAN: 256 KB. Browser internal SCTP buffer is typically 16 MB across
//      implementations; 256 KB is well within safe limits per send call.
// Internet: 64 KB. More conservative — higher RTT means the congestion
//      window opens more slowly, and smaller chunks let backpressure
//      respond faster to link degradation.
export const CHUNK_SIZE_LAN      = 256 * 1024   // 256 KB
export const CHUNK_SIZE_INTERNET = 64  * 1024   // 64 KB  (back to v1 — see note)

// ── Buffer thresholds ───────────────────────────────────────────────────────
// BUFFER_HIGH: pause sending when dc.bufferedAmount exceeds this.
// BUFFER_LOW:  resume (via bufferedamountlow event) once it falls below this.
//
// The gap between BUFFER_HIGH and BUFFER_LOW is the "hysteresis window".
// Too small a gap → the engine oscillates between send/pause rapidly
//   (ping-pong effect) → high CPU, low throughput.
// Too large a gap → long stalls while the buffer drains all the way down
//   → bursty throughput, not smooth.
// Rule of thumb: BUFFER_LOW should be ~25% of BUFFER_HIGH.
//
// LAN: 4 MB high / 1 MB low.
//   The browser's internal SCTP queue has a hard limit (varies by browser,
//   typically 16–32 MB). 4 MB is well within that, so "send queue is full"
//   cannot be triggered. The 1 MB low-water mark gives a wide enough
//   hysteresis window (3 MB) to smooth out send bursts without stalling.
//
// Internet: 2 MB high / 512 KB low.
//   More conservative to handle variable RTT without large buffer buildup
//   that would inflate latency (bufferbloat).
export const BUFFER_HIGH_LAN      = 4   * 1024 * 1024  // 4 MB
export const BUFFER_LOW_LAN       = 1   * 1024 * 1024  // 1 MB
export const BUFFER_HIGH_INTERNET = 2   * 1024 * 1024  // 2 MB
export const BUFFER_LOW_INTERNET  = 512 * 1024          // 512 KB

// ── Read-ahead depth ────────────────────────────────────────────────────────
// How many Blob.arrayBuffer() reads to have in flight concurrently.
// This overlaps disk/Blob I/O with the network send, hiding I/O latency.
// Keep this modest (2–4). Higher values don't help because I/O latency on
// modern hardware (SSD or in-memory Blob) is sub-millisecond, so 2 reads
// ahead is already more than enough to keep the pipeline fed.
export const READ_AHEAD_DEPTH = 2

// ── Connection timeouts ─────────────────────────────────────────────────────
// HANDSHAKE_TIMEOUT: time allowed for the WebRTC ICE + DTLS handshake to
//   complete (from join to DataChannel open). Does NOT apply to the transfer
//   phase — see transferEngine.js and useJoinSession.js for how this is
//   cancelled once the channel opens.
// CONNECT_TIMEOUT_MS is kept as a backward-compat alias.
export const HANDSHAKE_TIMEOUT_MS = 30_000
export const CONNECT_TIMEOUT_MS   = HANDSHAKE_TIMEOUT_MS

// ── Backward-compat aliases ─────────────────────────────────────────────────
export const CHUNK_SIZE = CHUNK_SIZE_INTERNET
export const BUFFER_LOW = BUFFER_LOW_INTERNET

/**
 * Returns the transfer profile for the given context.
 * @param {'lan'|'internet'} context
 */
export function getTransferProfile(context = 'internet') {
  if (context === 'lan') {
    return {
      chunkSize:  CHUNK_SIZE_LAN,
      bufferHigh: BUFFER_HIGH_LAN,
      bufferLow:  BUFFER_LOW_LAN,
      readAhead:  READ_AHEAD_DEPTH,
    }
  }
  return {
    chunkSize:  CHUNK_SIZE_INTERNET,
    bufferHigh: BUFFER_HIGH_INTERNET,
    bufferLow:  BUFFER_LOW_INTERNET,
    readAhead:  READ_AHEAD_DEPTH,
  }
}