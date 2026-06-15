import React from 'react'
import { formatBytes, formatSpeed, formatDuration } from '../../lib/utils'
import Sparkline from './Sparkline'

/**
 * Shown on the sender side when all receivers are done.
 * Pure derived data — no server involvement.
 */
export default function SessionSummary({ receivers, totalSize, fileList }) {
  const done = receivers.filter((r) => r.phase === 'done')
  if (!done.length) return null

  // Aggregate stats across all receivers
  const totalBytesOut  = done.reduce((s, r) => s + r.totalSent, 0)
  const longestSec     = done.reduce((max, r) => {
    const s = r.startedAt && r.finishedAt ? (r.finishedAt - r.startedAt) / 1000 : 0
    return Math.max(max, s)
  }, 0)
  const avgSpeeds = done.map((r) => {
    const s = r.startedAt && r.finishedAt ? (r.finishedAt - r.startedAt) / 1000 : 1
    return r.totalSent / s
  })
  const avgOverall = avgSpeeds.reduce((a, b) => a + b, 0) / avgSpeeds.length

  // Merge speed histories for a combined sparkline
  const maxLen   = Math.max(...done.map((r) => r.speedHistory.length))
  const combined = Array.from({ length: maxLen }, (_, i) => {
    const vals = done.map((r) => r.speedHistory[i] ?? 0)
    return vals.reduce((a, b) => a + b, 0)
  })

  return (
    <div className="card p-5 space-y-4 border-status-connected/20 animate-slide-up">
      {/* Title */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-status-connected" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <h3 className="font-heading font-semibold text-sm text-ink">Session Complete</h3>
      </div>

      {/* Big numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Receivers',    value: done.length.toString() },
          { label: 'Files',        value: fileList.length.toString() },
          { label: 'Total sent',   value: formatBytes(totalBytesOut) },
          { label: 'Duration',     value: formatDuration(longestSec) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-muted rounded-xl px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
            <p className="text-lg font-heading font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Speed sparkline + avg */}
      <div className="flex items-center gap-4 pt-1 border-t border-surface-border">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">
            Combined throughput
          </p>
          <Sparkline data={combined} color="#22c55e" width={200} height={36} />
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">Avg speed</p>
          <p className="text-base font-mono font-bold text-status-connected">
            {formatSpeed(avgOverall)}
          </p>
        </div>
      </div>
    </div>
  )
}