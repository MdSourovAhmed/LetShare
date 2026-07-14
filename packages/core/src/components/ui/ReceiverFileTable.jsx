



import React from 'react'
import clsx from 'clsx'
import { formatBytes } from '../../lib/utils'
import ProgressBar from './ProgressBar'

/**
 * ReceiverFileTable — v2.2
 *
 * Added per-file status column:
 *   pending    → "Waiting…"
 *   receiving  → progress bar + Skip button
 *   done       → Save button
 *   skipped    → "Skipped" badge (either side cancelled it)
 *
 * onSkipFile(index) — optional. If provided, shows the Skip button.
 * Called with the file index — the hook sends 'receiver_skip' over the
 * DataChannel, which the sender engine picks up at its next yield point.
 * No socket call, no server round-trip, no effect on transfer throughput.
 */
export default function ReceiverFileTable({ rows, onSkipFile }) {
  if (!rows.length) return null

  const handleDownload = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="card overflow-hidden animate-slide-up">
      <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
        <span className="font-heading font-semibold text-sm text-ink">Incoming Files</span>
        <span className="text-xs text-ink-muted">
          {rows.length} file{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-muted/50">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">
                Path
              </th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-24">
                Size
              </th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-44">
                Progress
              </th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-32">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((row, i) => {
              const status   = row.status || (row.url ? 'done' : row.progress > 0 ? 'receiving' : 'pending')
              const isDone    = status === 'done'
              const isSkipped = status === 'skipped'
              const isActive  = status === 'receiving'

              return (
                <tr
                  key={i}
                  className={clsx(
                    'transition-colors',
                    isSkipped ? 'opacity-40' : 'hover:bg-surface-muted/30'
                  )}
                >
                  {/* Path */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <svg
                        className={clsx('w-3.5 h-3.5 flex-shrink-0',
                          isSkipped ? 'text-ink-faint line-through' : 'text-ink-faint'
                        )}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      <span
                        className={clsx(
                          'text-xs font-mono truncate max-w-[200px]',
                          isSkipped ? 'line-through text-ink-faint' : 'text-ink'
                        )}
                        title={row.path}
                      >
                        {row.path}
                      </span>
                    </div>
                  </td>

                  {/* Size */}
                  <td className="px-5 py-3.5 font-mono text-ink-muted text-xs">
                    {formatBytes(row.size)}
                  </td>

                  {/* Progress */}
                  <td className="px-5 py-3.5">
                    {!isSkipped ? (
                      <div className="space-y-1">
                        <ProgressBar
                          value={row.progress}
                          variant={isDone ? 'success' : 'brand'}
                          size="sm"
                        />
                        <span className="text-xs text-ink-faint font-mono">
                          {row.progress}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint italic">—</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-5 py-3.5">
                    {isDone && (
                      <button
                        onClick={() => handleDownload(row.url, row.name)}
                        className="btn-success text-xs px-3 py-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Save
                      </button>
                    )}

                    {isSkipped && (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-faint bg-surface-muted px-2 py-1 rounded-lg">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        Skipped
                      </span>
                    )}

                    {/* Skip button — only shown while actively receiving and skip is wired */}
                    {isActive && onSkipFile && (
                      <button
                        onClick={() => onSkipFile(i)}
                        className="inline-flex items-center gap-1 text-xs text-status-error hover:text-white hover:bg-status-error/80 bg-status-error/10 border border-status-error/20 px-2 py-1.5 rounded-lg transition-all duration-150"
                        title="Skip this file"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        Skip
                      </button>
                    )}

                    {/* Pending — no action yet */}
                    {status === 'pending' && !isSkipped && (
                      <span className="text-xs text-ink-faint italic">Waiting…</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
