


import React from 'react'
import clsx from 'clsx'
import { formatBytes, formatSpeed, formatDuration } from '@letshare/core/lib/utils'
import ProgressBar    from '@letshare/core/components/ui/ProgressBar'
import Sparkline      from '@letshare/core/components/ui/Sparkline'
import RadialProgress from '@letshare/core/components/ui/RadialProgress'
import StatPill       from '@letshare/core/components/ui/StatPill'

const phaseStyles = {
  connecting:  { dot: 'bg-status-connecting animate-pulse-dot', label: 'Connecting…',  text: 'text-status-connecting' },
  transferring:{ dot: 'bg-brand-400 animate-pulse-dot',         label: 'Transferring', text: 'text-brand-400' },
  done:        { dot: 'bg-status-connected',                    label: 'Complete ✓',   text: 'text-status-connected' },
  error:       { dot: 'bg-status-error',                        label: 'Error',        text: 'text-status-error' },
}

/**
 * Shows the sharer a live log of every connected receiver with
 * per-receiver radial ring, sparkline, stat pills, and file progress.
 */
export default function TransferLog({ receivers, fileList, totalSize, onCancelReceiver }) {
  if (!receivers.length) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-xs text-ink-muted uppercase tracking-wider">
          Transfer log
        </h3>
        <span className="text-xs text-ink-faint">
          {receivers.filter((r) => r.phase === 'done').length} / {receivers.length} complete
        </span>
      </div>

      {receivers.map((r) => {
        const ps  = phaseStyles[r.phase] ?? phaseStyles.connecting
        const pct = totalSize > 0 ? Math.floor((r.totalSent / totalSize) * 100) : 0
        const elapsedSec = r.startedAt
          ? ((r.finishedAt ?? Date.now()) - r.startedAt) / 1000 : 0
        const avgSpeed = elapsedSec > 0 ? Math.round(r.totalSent / elapsedSec) : 0
        const peakBps  = r.speedHistory.length ? Math.max(...r.speedHistory) : 0
        const eta      = r.speedBps > 0 && totalSize > r.totalSent
          ? Math.ceil((totalSize - r.totalSent) / r.speedBps) : null


        console.log("Logs: ",ps,pct,elapsedSec,avgSpeed,peakBps,eta);  

        return (
          <div key={r.socketId} className={clsx(
            'card overflow-hidden transition-all duration-300',
            r.phase === 'done'  && 'border-status-connected/30',
            r.phase === 'error' && 'border-status-error/30',
          )}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className={clsx('status-dot', ps.dot)} />
                <span className="font-semibold text-sm text-ink">{r.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('text-xs font-medium', ps.text)}>{ps.label}</span>
                {onCancelReceiver && (r.phase === 'connecting' || r.phase === 'transferring') && (
                  <button
                    onClick={() => onCancelReceiver(r.socketId)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-status-error hover:bg-status-error/10 transition-all duration-150"
                    title="Disconnect this receiver"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Transferring / done body */}
            {(r.phase === 'transferring' || r.phase === 'done') && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <RadialProgress value={pct} size={52}
                    color={r.phase === 'done' ? '#22c55e' : '#00aee6'} />

                  <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 flex-1">
                    <StatPill label="Sent"  value={formatBytes(r.totalSent)} accent />
                    <StatPill label="Total" value={formatBytes(totalSize)} />
                    <StatPill label="Speed"
                      value={r.phase === 'done' ? '—' : formatSpeed(r.speedBps)} accent />
                    <StatPill label="Avg"   value={formatSpeed(avgSpeed)} />
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Sparkline
                      data={r.speedHistory}
                      color={r.phase === 'done' ? '#22c55e' : '#00aee6'}
                      width={64} height={26}
                    />
                    <span className="text-[10px] text-ink-faint font-mono">
                      peak {formatSpeed(peakBps)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <ProgressBar value={pct}
                    variant={r.phase === 'done' ? 'success' : 'brand'} size="sm" />
                  <div className="flex justify-between text-[11px] text-ink-faint font-mono">
                    <span>{pct}%</span>
                    {eta !== null && r.phase === 'transferring' && (
                      <span>ETA {formatDuration(eta)}</span>
                    )}
                    {r.phase === 'done' && r.startedAt && (
                      <span>Done in {formatDuration(elapsedSec)}</span>
                    )}
                  </div>
                </div>

                {/* Per-file bars */}
                {r.phase === 'transferring' && fileList.length > 1 && (
                  <div className="space-y-1.5 pt-2 border-t border-surface-border">
                    {fileList.map((f, i) => {
                      const fp = r.fileProgress[i] ?? 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[11px] text-ink-faint truncate flex-1 font-mono" title={f.path}>
                            {f.path}
                          </span>
                          <span className="text-[11px] font-mono text-ink-faint w-7 text-right flex-shrink-0">
                            {fp}%
                          </span>
                          <div className="w-16 flex-shrink-0">
                            <ProgressBar value={fp} size="sm"
                              variant={fp === 100 ? 'success' : 'brand'} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Connecting */}
            {r.phase === 'connecting' && (
              <div className="px-4 py-4 flex items-center gap-3 text-ink-faint">
                <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-xs">Establishing WebRTC connection…</span>
              </div>
            )}

            {/* Error */}
            {r.phase === 'error' && r.error && (
              <p className="px-4 py-3 text-xs text-status-error">{r.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
