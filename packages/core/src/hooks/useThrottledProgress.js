import { useRef, useCallback } from 'react'

/**
 * useThrottledProgress — v2
 *
 * v1 problem: useSender/useReceiver called setState() on EVERY chunk
 * received/sent, even between the 250ms speed-sample windows. With 64 KB
 * chunks that's potentially 1000+ re-renders per second on a fast LAN
 * transfer — React's reconciliation was competing with the transfer loop
 * for the main thread, throttling actual throughput.
 *
 * v2: progress updates are batched to a fixed interval (default 100ms,
 * ~10 UI updates/sec — smooth to the eye, far cheaper than per-chunk).
 * The underlying byte counters still update synchronously and instantly
 * (so ETA/total-sent math is always accurate), but React only re-renders
 * at the throttled rate.
 *
 * @param {(flush: () => void) => void} [onFlush] optional hook called on each flush
 * @param {number} [intervalMs]
 */
export function useThrottledProgress(intervalMs = 100) {
  const lastFlush = useRef(0)
  const pendingFlush = useRef(null)

  /**
   * Call this on every progress event. `fn` is the actual setState call —
   * it will only be invoked at most once per `intervalMs`, with the LAST
   * call's arguments winning (no stale intermediate renders queued up).
   */
  const throttledUpdate = useCallback((fn) => {
    const now = performance.now()
    pendingFlush.current = fn

    if (now - lastFlush.current >= intervalMs) {
      lastFlush.current = now
      const toRun = pendingFlush.current
      pendingFlush.current = null
      toRun()
    } else if (pendingFlush.current && !pendingFlush.current._scheduled) {
      // Schedule a trailing flush so the FINAL state of a burst always renders
      const delay = intervalMs - (now - lastFlush.current)
      setTimeout(() => {
        if (pendingFlush.current) {
          lastFlush.current = performance.now()
          const toRun = pendingFlush.current
          pendingFlush.current = null
          toRun()
        }
      }, Math.max(0, delay))
    }
  }, [intervalMs])

  /** Force-flush immediately — call this on file/transfer completion. */
  const flushNow = useCallback(() => {
    if (pendingFlush.current) {
      lastFlush.current = performance.now()
      const toRun = pendingFlush.current
      pendingFlush.current = null
      toRun()
    }
  }, [])

  return { throttledUpdate, flushNow }
}
