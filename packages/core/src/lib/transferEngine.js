





/**
 * transferEngine.js — v2.2
 *
 * Adds per-file cancellation (skip) with zero overhead to the hot transfer path.
 *
 * Design principle: the transfer loop already yields to the JS event loop
 * once per chunk (at `await pending.shift()` and `await sendWithBackpressure`).
 * Cancellation checks piggyback on those existing yields — no new awaits,
 * no socket round-trips, no mid-loop state updates, no AbortController.
 *
 * Hot path cost of cancellation: one Set.has() call per chunk (nanoseconds).
 * Control message cost: one small JSON string per skipped file, sent BETWEEN
 * files over the same DataChannel — not inside the chunk loop.
 *
 * Per-file skip API:
 *   engine.skipFile(index)    — skip file at index (sender-initiated)
 *   engine.cancel()           — abort the entire transfer (whole session)
 *
 * New control messages (DataChannel, not socket.io):
 *   { type: 'file_skipped',   index }  — sender tells receiver to discard file i
 *   { type: 'receiver_skip',  index }  — receiver tells sender to skip file i
 *   (receiver_skip is sent by the RECEIVER's hook, read by the sender's onmessage)
 */

/**
 * @param {RTCDataChannel} dc
 * @param {File[]} files
 * @param {{ chunkSize, bufferHigh, bufferLow, readAhead }} profile
 * @param {{
 *   onFileStart?:   (index: number) => void,
 *   onChunkSent?:   (index: number, offset: number, fileSize: number) => void,
 *   onFileEnd?:     (index: number) => void,
 *   onFileSkipped?: (index: number) => void,
 *   onCancelled?:   () => void,
 *   onPauseStart?:  () => void,
 *   onPauseEnd?:    () => void,
 *   getFileMeta?:   (file: File) => { path, name, size, type },
 * }} callbacks
 */
export function createTransferEngine(dc, files, profile, callbacks = {}) {
  const { chunkSize, bufferHigh, bufferLow, readAhead } = profile
  const {
    onFileStart, onChunkSent, onFileEnd,
    onFileSkipped, onCancelled,
    onPauseStart, onPauseEnd,
    getFileMeta,
  } = callbacks

  // ── Skip and cancel state ─────────────────────────────────────────────────
  // Both live outside the loop and are read at existing yield points only.
  // No mutex needed — JS is single-threaded; Set mutations are synchronous
  // and cannot race with the async loop.
  const skipSet   = new Set()   // file indexes to skip (O(1) lookup per file)
  let   cancelled = false
  let   drainResolver = null

  /**
   * Skip a specific file by index.
   * If the engine is currently sending that file, it will finish the current
   * chunk (Blob reads cannot be aborted), then exit the file loop at the next
   * yield and send a 'file_skipped' control message before moving on.
   * Cost: one Set.add() call — no await, no state update, no socket call.
   */
  function skipFile(index) {
    skipSet.add(index)
    // If we're waiting for drain on this file, unblock it so the loop
    // can check skipSet at the earliest opportunity.
    if (drainResolver) { drainResolver(); drainResolver = null }
  }

  /** Abort the entire transfer session. */
  function cancel() {
    cancelled = true
    if (drainResolver) { drainResolver(); drainResolver = null }
  }

  // ── Backpressure ───────────────────────────────────────────────────────────
  dc.bufferedAmountLowThreshold = bufferLow

  function waitForDrain() {
    if (dc.bufferedAmount <= bufferLow) return Promise.resolve()
    onPauseStart?.()
    return new Promise((resolve) => {
      drainResolver = resolve
      const onLow = () => {
        dc.removeEventListener('bufferedamountlow', onLow)
        drainResolver = null
        onPauseEnd?.()
        resolve()
      }
      dc.addEventListener('bufferedamountlow', onLow)
    })
  }

  async function sendWithBackpressure(buf) {
    if (dc.bufferedAmount > bufferHigh) await waitForDrain()
    if (cancelled)                       throw new Error('Transfer cancelled')
    if (dc.readyState !== 'open')        throw new Error('Data channel closed mid-transfer')
    dc.send(buf)
  }

  // ── Per-file sender ────────────────────────────────────────────────────────
  async function sendFile(file, index) {
    const size = file.size
    let readOffset = 0
    let sentOffset = 0
    const pending  = []

    function scheduleReads() {
      while (pending.length < readAhead && readOffset < size && !cancelled && !skipSet.has(index)) {
        const start = readOffset
        const end   = Math.min(start + chunkSize, size)
        readOffset  = end
        pending.push(file.slice(start, end).arrayBuffer().then((buf) => ({ buf })))
      }
    }

    onFileStart?.(index)
    scheduleReads()

    while (sentOffset < size) {
      if (cancelled)          throw new Error('Transfer cancelled')
      // ← Per-file check: O(1) Set.has(), at the same yield point as all
      //   other checks. If true, drain the pending queue (reads already
      //   in flight complete but are discarded, not sent) and return.
      if (skipSet.has(index)) {
        // Drain pending reads without sending — let GC reclaim them
        while (pending.length) await pending.shift()
        return   // caller sends 'file_skipped' message
      }

      const { buf } = await pending.shift()
      scheduleReads()

      // After resuming from a drain-wait, re-check skip — the user may
      // have clicked cancel while we were waiting for backpressure.
      if (skipSet.has(index) || cancelled) {
        while (pending.length) await pending.shift()
        if (cancelled) throw new Error('Transfer cancelled')
        return   // skip this file
      }

      await sendWithBackpressure(buf)
      sentOffset += buf.byteLength
      onChunkSent?.(index, sentOffset, size)
    }

    onFileEnd?.(index)
  }

  // ── Main run loop ──────────────────────────────────────────────────────────
  async function run() {
    if (cancelled) return

    // Build manifest — include ALL files even ones that may be skipped later,
    // so the receiver knows the full list and can display them all upfront.
    const manifest = files.map((f) => getFileMeta?.(f) ?? {
      path: f.webkitRelativePath || f.name,
      name: f.name, size: f.size,
      type: f.type || 'application/octet-stream',
    })
    dc.send(JSON.stringify({ type: 'manifest', version: 2, files: manifest }))

    for (let i = 0; i < files.length; i++) {
      if (cancelled) break

      // File was skipped before we even reached it — no 'start' message sent,
      // so receiver knows it never began. Just notify receiver to mark it.
      if (skipSet.has(i)) {
        dc.send(JSON.stringify({ type: 'file_skipped', index: i }))
        onFileSkipped?.(i)
        continue
      }

      dc.send(JSON.stringify({ type: 'start', index: i }))
      await sendFile(files[i], i)

      if (cancelled) break

      if (skipSet.has(i)) {
        // File was skipped mid-send (sendFile returned early)
        dc.send(JSON.stringify({ type: 'file_skipped', index: i }))
        onFileSkipped?.(i)
      } else {
        dc.send(JSON.stringify({ type: 'end', index: i }))
      }
    }

    if (cancelled) {
      if (dc.readyState === 'open') {
        try { dc.send(JSON.stringify({ type: 'cancelled' })) } catch {}
      }
      onCancelled?.()
    } else {
      dc.send(JSON.stringify({ type: 'all_done' }))
    }
  }

  // ── Incoming DataChannel messages (receiver_skip from the other side) ──────
  // The engine wires itself up to handle messages sent BY THE RECEIVER back
  // through the DataChannel. This keeps the skip protocol entirely within the
  // engine — the hook doesn't need to know about it.
  function handleIncoming(e) {
    if (typeof e.data !== 'string') return
    try {
      const msg = JSON.parse(e.data)
      if (msg?.type === 'receiver_skip') skipFile(msg.index)
    } catch {}
  }
  dc.addEventListener('message', handleIncoming)

  // Returned cleanup removes the listener when the transfer ends
  function cleanup() {
    dc.removeEventListener('message', handleIncoming)
  }

  return { run, cancel, skipFile, cleanup }
}
