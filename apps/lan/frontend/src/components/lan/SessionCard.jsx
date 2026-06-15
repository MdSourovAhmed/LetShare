import React from 'react'
import clsx from 'clsx'
import { formatBytes } from '@letshare/core/lib/utils'

/**
 * Displays one active session in the lobby grid.
 * Shown to everyone except the session owner.
 */
export default function SessionCard({ session, isOwn, onJoin }) {
  const { label, mode, fileCount, totalSize, receiverCount, ownerName } = session
  const isPin  = mode === 'pin'

  return (
    <div className={clsx(
      'card p-5 space-y-4 transition-all duration-200',
      isOwn
        ? 'border-brand-500/30 bg-brand-500/5'
        : 'hover:border-brand-500/30 hover:bg-surface-muted/30'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center flex-shrink-0 text-ink-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{label}</p>
            <p className="text-xs text-ink-muted">{ownerName}</p>
          </div>
        </div>

        {/* PIN badge */}
        {isPin && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-status-connecting bg-status-connecting/10 border border-status-connecting/20 px-2 py-0.5 rounded-full flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            PIN
          </span>
        )}
        {!isPin && (
          <span className="text-[10px] font-medium text-status-connected bg-status-connected/10 border border-status-connected/20 px-2 py-0.5 rounded-full flex-shrink-0">
            Open
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-ink-muted font-mono">
        <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
        <span className="text-ink-faint">·</span>
        <span>{formatBytes(totalSize)}</span>
        <span className="text-ink-faint">·</span>
        <span>{receiverCount} downloading</span>
      </div>

      {/* Action */}
      {isOwn ? (
        <p className="text-xs text-brand-400 font-medium">Your active share</p>
      ) : (
        <button onClick={() => onJoin(session)} className="btn-primary w-full py-2.5 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          {isPin ? 'Enter PIN & Download' : 'Download'}
        </button>
      )}
    </div>
  )
}