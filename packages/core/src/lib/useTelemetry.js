/**
 * useTelemetry.js — v4
 *
 * Thin hook wrapper around telemetryTracker.js, for the genuine 1:1 case:
 * one hook instance = one transfer (both receiver hooks, and any sender
 * that only ever has a single peer). Holds a single tracker in a ref so
 * it's stable across re-renders.
 *
 * Fan-out senders (multiple concurrent receivers — see useShareSession.js
 * and useSender.js) must NOT use this hook. A shared tracker across
 * multiple simultaneous transfers corrupts connection time, chunk counts,
 * and per-file timings between receivers. Those hooks call
 * createTelemetryTracker() directly, once per receiver, instead.
 */
import { useRef } from 'react'
import { createTelemetryTracker } from './telemetryTracker'

/**
 * @param {{ mode: 'internet'|'lan', role: 'sender'|'receiver' }} options
 */
export function useTelemetry({ mode, role }) {
  const trackerRef = useRef(null)
  if (!trackerRef.current) {
    trackerRef.current = createTelemetryTracker({ mode, role })
  }
  return trackerRef.current
}
