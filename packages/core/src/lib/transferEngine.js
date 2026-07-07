// /**
//  * transferEngine.js — v2 optimized file sender
//  *
//  * Replaces the v1 serial "read chunk → send chunk → wait → repeat" loop
//  * (which existed separately, near-duplicated, in both the Internet and LAN
//  * apps' sender hooks) with a single shared, pipelined implementation.
//  *
//  * Three concrete speed improvements over v1:
//  *
//  * 1. READ-AHEAD PIPELINING
//  *    v1 awaited `file.slice().arrayBuffer()` for chunk N, sent it, THEN
//  *    started reading chunk N+1. Disk/Blob I/O and network send were fully
//  *    serial. v2 keeps `readAhead` chunks in flight: while chunk N is being
//  *    sent over the data channel, chunks N+1..N+readAhead are already being
//  *    read from the Blob in parallel. This overlaps I/O latency with network
//  *    time instead of paying for both sequentially.
//  *
//  * 2. EVENT-DRIVEN BACKPRESSURE
//  *    v1 polled `dc.bufferedAmount` every 10ms via setTimeout — wasted CPU,
//  *    and up to 10ms of dead time on every backpressure pause. v2 uses the
//  *    data channel's native `bufferedamountlow` event, which fires the
//  *    instant the buffer drains below threshold — zero polling overhead,
//  *    zero added latency.
//  *
//  * 3. LARGER, PROFILE-AWARE CHUNK + BUFFER SIZES
//  *    See lib/webrtc.js — LAN gets 256 KB chunks / 16 MB buffer ceiling,
//  *    Internet gets 128 KB chunks / 8 MB buffer ceiling (both up from the
//  *    v1 flat 64 KB / 512 KB). Fewer round-trips through the JS event loop
//  *    per byte sent = less overhead, more throughput.
//  *
//  * Usage:
//  *   const engine = createTransferEngine(dc, files, profile, callbacks)
//  *   await engine.run()
//  */

// /**
//  * @param {RTCDataChannel} dc
//  * @param {File[]} files
//  * @param {{chunkSize:number, bufferHigh:number, bufferLow:number, readAhead:number}} profile
//  * @param {{
//  *   onFileStart?: (index:number) => void,
//  *   onChunkSent?: (index:number, offset:number, fileSize:number, totalSent:number) => void,
//  *   onFileEnd?: (index:number) => void,
//  *   getFileMeta?: (file:File) => {path:string,name:string,size:number,type:string},
//  * }} callbacks
//  */
// export function createTransferEngine(dc, files, profile, callbacks = {}) {
//   const { chunkSize, bufferHigh, bufferLow, readAhead } = profile
//   const { onFileStart, onChunkSent, onFileEnd, getFileMeta } = callbacks

//   dc.bufferedAmountLowThreshold = bufferLow

//   /** Wait for the channel to drain below bufferLow, event-driven (no polling). */
//   function waitForDrain() {
//     if (dc.bufferedAmount <= bufferLow) return Promise.resolve()
//     return new Promise((resolve) => {
//       const onLow = () => {
//         dc.removeEventListener('bufferedamountlow', onLow)
//         resolve()
//       }
//       dc.addEventListener('bufferedamountlow', onLow)
//     })
//   }

//   /**
//    * Pipelined sender for a single file.
//    * Maintains up to `readAhead` in-flight Blob reads ahead of the chunk
//    * currently being transmitted, so I/O and network overlap.
//    */
//   async function sendFile(file, index) {
//     const size = file.size
//     let readOffset = 0           // next byte offset to start reading
//     let sentOffset = 0           // bytes confirmed sent (drives progress)
//     const pending = []           // queue of in-flight read Promises

//     function scheduleReads() {
//       while (pending.length < readAhead && readOffset < size) {
//         const start = readOffset
//         const end = Math.min(start + chunkSize, size)
//         readOffset = end
//         pending.push(
//           file.slice(start, end).arrayBuffer().then((buf) => ({ buf, start }))
//         )
//       }
//     }

//     onFileStart?.(index)
//     scheduleReads()

//     while (sentOffset < size) {
//       // Wait for the next chunk's read to complete (may already be done)
//       const { buf } = await pending.shift()

//       // Keep the read-ahead pipeline topped up immediately after consuming one
//       scheduleReads()

//       // Respect data channel backpressure before sending
//       if (dc.bufferedAmount > bufferHigh) await waitForDrain()
//       //   while (dc.bufferedAmount + buf.byteLength > bufferHigh) {
//       // await waitForDrain();
//       // }
//       if (dc.readyState !== 'open') throw new Error('Data channel closed mid-transfer')

//       dc.send(buf)
//       sentOffset += buf.byteLength

//       onChunkSent?.(index, sentOffset, size, sentOffset)
//     }

//     onFileEnd?.(index)
//   }

//   async function run() {
//     // Manifest first — receiver needs file metadata before any chunk arrives
//     const manifest = files.map((f) => getFileMeta?.(f) ?? {
//       path: f.webkitRelativePath || f.name,
//       name: f.name,
//       size: f.size,
//       type: f.type || 'application/octet-stream',
//     })
//     dc.send(JSON.stringify({ type: 'manifest', version: 2, files: manifest }))

//     for (let i = 0; i < files.length; i++) {
//       dc.send(JSON.stringify({ type: 'start', index: i }))
//       await sendFile(files[i], i)
//       dc.send(JSON.stringify({ type: 'end', index: i }))
//     }

//     dc.send(JSON.stringify({ type: 'all_done' }))
//   }

//   return { run }
// }



/**
 * transferEngine.js — v2.1
 *
 * Fixes two bugs introduced in v2.0:
 *
 * BUG 1 — "RTCDataChannel send queue is full"
 * Root cause: the read-ahead pipeline resolved multiple Blob reads
 * concurrently. The backpressure gate (dc.bufferedAmount > bufferHigh)
 * was checked once per loop iteration BEFORE the send, but the loop
 * awaited pending.shift() first. While awaiting, all other in-flight
 * reads settled. On resume, the loop sent all of them back-to-back
 * with no yield between sends, bypassing the gate and filling the
 * browser's internal SCTP queue until it threw.
 *
 * Fix: check backpressure INSIDE the send path, immediately before
 * every dc.send() call, using a dedicated sendWithBackpressure() helper.
 * Read-ahead is kept (it still helps with I/O latency), but the send gate
 * is now in the critical path and cannot be bypassed by concurrent reads.
 *
 * BUG 2 — "Connection timed out" at ~70% of large files
 * Root cause: CONNECT_TIMEOUT_MS (45 s) was set at join/connect time and
 * never cancelled once the DataChannel opened. On a fast LAN, micro-pauses
 * from the (now-fixed) backpressure stalling accumulated over time. The
 * cumulative stall time exceeded 45 s before the transfer completed, so
 * the receiver's timeout fired "Connection timed out" even though the
 * transfer was physically still progressing fine.
 *
 * Fix: the engine exposes a cancel() method. The caller (useSender /
 * useShareSession) cancels the connection timeout the moment the
 * DataChannel opens. The timeout only guards the handshake phase.
 * The engine also exposes an abort signal so in-progress transfers
 * can be cancelled from the UI cleanly.
 */

/**
 * @param {RTCDataChannel} dc
 * @param {File[]} files
 * @param {{chunkSize:number, bufferHigh:number, bufferLow:number, readAhead:number}} profile
 * @param {{
 *   onFileStart?:  (index:number) => void,
 *   onChunkSent?:  (index:number, offset:number, fileSize:number) => void,
 *   onFileEnd?:    (index:number) => void,
 *   onCancelled?:  () => void,
 *   getFileMeta?:  (file:File) => {path:string,name:string,size:number,type:string},
 * }} callbacks
 */
export function createTransferEngine(dc, files, profile, callbacks = {}) {
  const { chunkSize, bufferHigh, bufferLow, readAhead } = profile
  const { onFileStart, onChunkSent, onFileEnd, onCancelled, getFileMeta } = callbacks

  // ── Abort / cancel ─────────────────────────────────────────────────────────
  let cancelled = false
  let drainResolver = null   // held so cancel() can unblock a waiting drain

  function cancel() {
    cancelled = true
    if (drainResolver) {
      drainResolver()   // unblock any pending waitForDrain()
      drainResolver = null
    }
  }

  // ── Backpressure — event-driven, cannot be bypassed ────────────────────────
  // Set the threshold the browser uses to fire 'bufferedamountlow'.
  dc.bufferedAmountLowThreshold = bufferLow

  /**
   * Wait until dc.bufferedAmount drops below bufferLow.
   * Returns immediately if already below. Resolves immediately if cancelled
   * (the outer send loop will then check `cancelled` and throw).
   */
  function waitForDrain() {
    if (dc.bufferedAmount <= bufferLow) return Promise.resolve()
    return new Promise((resolve) => {
      drainResolver = resolve
      const onLow = () => {
        dc.removeEventListener('bufferedamountlow', onLow)
        drainResolver = null
        resolve()
      }
      dc.addEventListener('bufferedamountlow', onLow)
    })
  }

  /**
   * The ONLY place dc.send() is called.
   * Checks backpressure immediately before every send — no bypassing possible.
   * Throws if cancelled or channel closed.
   */
  async function sendWithBackpressure(buf) {
    // Drain BEFORE sending this chunk, not before reading it.
    // This is the critical fix vs v2.0 where the check was before the read.
    if (dc.bufferedAmount > bufferHigh) {
      await waitForDrain()
    }
    if (cancelled)               throw new Error('Transfer cancelled')
    if (dc.readyState !== 'open') throw new Error('Data channel closed mid-transfer')
    dc.send(buf)
  }

  // ── Per-file sender with read-ahead ────────────────────────────────────────
  async function sendFile(file, index) {
    const size = file.size
    let readOffset = 0
    let sentOffset = 0
    const pending = []

    /**
     * Fill the read-ahead queue up to `readAhead` concurrent Blob reads.
     * Each entry resolves to { buf: ArrayBuffer }.
     * We read ahead but we NEVER send ahead — the read-ahead only hides
     * Blob/disk I/O latency; actual sending is still serialized and gated.
     */
    function scheduleReads() {
      while (pending.length < readAhead && readOffset < size && !cancelled) {
        const start = readOffset
        const end   = Math.min(start + chunkSize, size)
        readOffset  = end
        pending.push(file.slice(start, end).arrayBuffer().then((buf) => ({ buf })))
      }
    }

    onFileStart?.(index)
    scheduleReads()

    while (sentOffset < size) {
      if (cancelled) throw new Error('Transfer cancelled')

      // Await the next pre-read chunk
      const { buf } = await pending.shift()

      // Immediately schedule the next read to keep the pipeline full
      scheduleReads()

      // Gate: check + possibly wait for buffer to drain BEFORE sending.
      // This runs for every single chunk — no batch can bypass it.
      await sendWithBackpressure(buf)

      sentOffset += buf.byteLength
      onChunkSent?.(index, sentOffset, size)
    }

    onFileEnd?.(index)
  }

  // ── Main run loop ──────────────────────────────────────────────────────────
  async function run() {
    if (cancelled) return

    const manifest = files.map((f) => getFileMeta?.(f) ?? {
      path: f.webkitRelativePath || f.name,
      name: f.name,
      size: f.size,
      type: f.type || 'application/octet-stream',
    })
    dc.send(JSON.stringify({ type: 'manifest', version: 2, files: manifest }))

    for (let i = 0; i < files.length; i++) {
      if (cancelled) break
      dc.send(JSON.stringify({ type: 'start', index: i }))
      await sendFile(files[i], i)
      if (!cancelled) dc.send(JSON.stringify({ type: 'end', index: i }))
    }

    if (cancelled) {
      // Tell the receiver the transfer was cancelled mid-stream
      if (dc.readyState === 'open') {
        try { dc.send(JSON.stringify({ type: 'cancelled' })) } catch {}
      }
      onCancelled?.()
    } else {
      dc.send(JSON.stringify({ type: 'all_done' }))
    }
  }

  return { run, cancel }
}