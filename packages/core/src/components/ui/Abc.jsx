import React from 'react'
import { formatBytes, formatSpeed, formatDuration } from '../../lib/utils.js'
import ProgressBar    from './ProgressBar'
import Sparkline      from './Sparkline'
import RadialProgress from './RadialProgress'
import StatPill       from './StatPill'

/**
 * Rich stats panel shown on the receiver page during and after transfer.
 * All data is local state — zero server calls.
 */
export default function Abc({
  totalSize,
  totalReceived,
  speedBps,
  speedHistory,
  peakBps,
  startedAt,
  finishedAt,
  phase,
}) {
  if (!totalSize) return null

  const pct        = totalSize > 0 ? Math.floor((totalReceived / totalSize) * 100) : 0
  const elapsedSec = startedAt
    ? ((finishedAt ?? Date.now()) - startedAt) / 1000
    : 0
  const avgSpeedBps = elapsedSec > 0 ? Math.round(totalReceived / elapsedSec) : 0
  const eta         = speedBps > 0 && totalSize > totalReceived
    ? Math.ceil((totalSize - totalReceived) / speedBps)
    : null
  const done        = phase === 'done'

  return (
    <div className={`card p-5 space-y-4 animate-slide-up transition-colors duration-500 ${
      done ? 'border-status-connected/30' : ''
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-muted uppercase tracking-wider">
          Transfer stats
        </span>
        {done && (
          <span className="text-xs text-status-connected font-medium">
            ✓ Done in {formatDuration(elapsedSec)}
          </span>
        )}
      </div>

      {/* Main stats row */}
      <div className="flex items-center gap-4">
        {/* Radial */}
        <RadialProgress
          value={pct}
          size={64}
          stroke={5}
          color={done ? '#22c55e' : '#00aee6'}
        />

        {/* Pills */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
          <StatPill label="Received" value={formatBytes(totalReceived)} accent />
          <StatPill label="Total"    value={formatBytes(totalSize)} />
          <StatPill label="Speed"    value={done ? '—' : formatSpeed(speedBps)} accent />
          <StatPill label="Avg"      value={formatSpeed(avgSpeedBps)} />
        </div>

        {/* Sparkline */}
        <div className="flex flex-col items-end gap-1">
          <Sparkline
            data={speedHistory}
            color={done ? '#22c55e' : '#00aee6'}
            width={80}
            height={32}
          />
          <span className="text-[10px] text-ink-faint font-mono">
            peak {formatSpeed(peakBps)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <ProgressBar value={pct} variant={done ? 'success' : 'brand'} />
        <div className="flex justify-between text-[11px] text-ink-faint font-mono">
          <span>{formatBytes(totalReceived)} / {formatBytes(totalSize)}</span>
          {eta !== null && !done && <span>ETA {formatDuration(eta)}</span>}
          {done && <span>100%</span>}
        </div>
      </div>
    </div>
  )
}