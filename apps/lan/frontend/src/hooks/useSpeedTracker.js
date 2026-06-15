import { useState, useRef, useCallback } from 'react'

export function useSpeedTracker() {
  const [speedBps,     setSpeedBps]     = useState(0)
  const [speedHistory, setSpeedHistory] = useState([])
  const [peakBps,      setPeakBps]      = useState(0)

  const ref = useRef({ lastBytes: 0, lastTime: Date.now(), totalBytes: 0 })

  const onBytes = useCallback((delta) => {
    const r   = ref.current
    r.totalBytes += delta
    const now     = Date.now()
    const elapsed = (now - r.lastTime) / 1000
    if (elapsed < 0.25) return
    const speed = Math.round((r.totalBytes - r.lastBytes) / elapsed)
    r.lastBytes = r.totalBytes
    r.lastTime  = now
    setSpeedBps(speed)
    setPeakBps((p) => Math.max(p, speed))
    setSpeedHistory((h) => [...h, speed].slice(-20))
  }, [])

  const reset = useCallback(() => {
    ref.current = { lastBytes: 0, lastTime: Date.now(), totalBytes: 0 }
    setSpeedBps(0)
    setSpeedHistory([])
    setPeakBps(0)
  }, [])

  return { speedBps, speedHistory, peakBps, onBytes, reset }
}