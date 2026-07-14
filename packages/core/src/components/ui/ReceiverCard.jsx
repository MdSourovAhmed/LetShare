
import React from 'react'
import clsx from 'clsx'
import { formatBytes, formatSpeed, formatDuration } from '../../lib/utils'
import ProgressBar    from './ProgressBar'
import Sparkline      from './Sparkline'
import RadialProgress from './RadialProgress'
import StatPill       from './StatPill'

const phaseStyles = {
  connecting:  { dot: 'bg-status-connecting animate-pulse-dot', label: 'Connecting…',  text: 'text-status-connecting' },
  transferring:{ dot: 'bg-brand-400 animate-pulse-dot',         label: 'Transferring', text: 'text-brand-400' },
  done:        { dot: 'bg-status-connected',                    label: 'Complete ✓',   text: 'text-status-connected' },
  error:       { dot: 'bg-status-error',                        label: 'Error',        text: 'text-status-error' },
}

/**
 * ReceiverCard — v2.2
 * Added onCancelReceiver prop. When provided, shows a "Disconnect" button
 * that calls engine.cancel() for this peer only via the hook's cancelReceiver().
 */
export default function ReceiverCard({ receiver, fileList, totalSize, onCancelReceiver }) {
  const ps  = phaseStyles[receiver.phase] ?? phaseStyles.connecting
  const pct = totalSize > 0 ? Math.floor((receiver.totalSent / totalSize) * 100) : 0

  const elapsedSec  = receiver.startedAt
    ? ((receiver.finishedAt ?? Date.now()) - receiver.startedAt) / 1000 : 0
  const avgSpeedBps = elapsedSec > 0 ? Math.round(receiver.totalSent / elapsedSec) : 0
  const peakBps     = receiver.speedHistory.length ? Math.max(...receiver.speedHistory) : 0
  const eta         = receiver.speedBps > 0 && totalSize > receiver.totalSent
    ? Math.ceil((totalSize - receiver.totalSent) / receiver.speedBps) : null

  return (
    <div className={clsx(
      'card overflow-hidden transition-all duration-300',
      receiver.phase === 'done'  && 'border-status-connected/30',
      receiver.phase === 'error' && 'border-status-error/30',
    )}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <span className={clsx('status-dot', ps.dot)} />
          <span className="font-semibold text-sm text-ink">{receiver.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs font-medium', ps.text)}>{ps.label}</span>
          {/* Disconnect button — only while actively connecting or transferring */}
          {onCancelReceiver && (
            <button
              onClick={onCancelReceiver}
              className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-status-error hover:bg-status-error/10 transition-all duration-150"
              title="Disconnect this receiver"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Transferring / done body */}
      {(receiver.phase === 'transferring' || receiver.phase === 'done') && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <RadialProgress value={pct} size={52}
              color={receiver.phase === 'done' ? '#22c55e' : '#00aee6'} />

            <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 flex-1">
              <StatPill label="Sent"  value={formatBytes(receiver.totalSent)} accent />
              <StatPill label="Total" value={formatBytes(totalSize)} />
              <StatPill label="Speed"
                value={receiver.phase === 'done' ? '—' : formatSpeed(receiver.speedBps)} accent />
              <StatPill label="Avg"   value={formatSpeed(avgSpeedBps)} />
            </div>

            <div className="flex flex-col items-end gap-1">
              <Sparkline
                data={receiver.speedHistory}
                color={receiver.phase === 'done' ? '#22c55e' : '#00aee6'}
                width={64} height={26}
              />
              <span className="text-[10px] text-ink-faint font-mono">
                peak {formatSpeed(peakBps)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <ProgressBar value={pct}
              variant={receiver.phase === 'done' ? 'success' : 'brand'} size="sm" />
            <div className="flex justify-between text-[11px] text-ink-faint font-mono">
              <span>{pct}%</span>
              {eta !== null && receiver.phase === 'transferring' && (
                <span>ETA {formatDuration(eta)}</span>
              )}
              {receiver.phase === 'done' && receiver.startedAt && (
                <span>Done in {formatDuration(elapsedSec)}</span>
              )}
            </div>
          </div>

          {/* Per-file mini bars while transferring */}
          {receiver.phase === 'transferring' && fileList.length > 1 && (
            <div className="space-y-1.5 pt-2 border-t border-surface-border">
              {fileList.map((f, i) => {
                const fp        = receiver.fileProgress[i] ?? 0
                const isSkipped = f.status === 'skipped'
                return (
                  <div key={i} className={clsx('flex items-center gap-2', isSkipped && 'opacity-40')}>
                    <span
                      className={clsx(
                        'text-[11px] text-ink-faint truncate flex-1 font-mono',
                        isSkipped && 'line-through'
                      )}
                      title={f.path}
                    >
                      {f.path}
                    </span>
                    <span className="text-[11px] font-mono text-ink-faint w-7 text-right flex-shrink-0">
                      {isSkipped ? '—' : `${fp}%`}
                    </span>
                    <div className="w-16 flex-shrink-0">
                      {!isSkipped
                        ? <ProgressBar value={fp} size="sm" variant={fp === 100 ? 'success' : 'brand'} />
                        : <div className="h-1.5 bg-surface-border rounded-full" />
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Connecting placeholder */}
      {receiver.phase === 'connecting' && (
        <div className="px-4 py-4 flex items-center gap-3 text-ink-faint">
          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-xs">Establishing WebRTC connection…</span>
        </div>
      )}

      {/* Error */}
      {receiver.phase === 'error' && receiver.error && (
        <p className="px-4 py-3 text-xs text-status-error">{receiver.error}</p>
      )}
    </div>
  )
}