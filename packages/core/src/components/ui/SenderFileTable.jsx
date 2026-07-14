


import React from 'react'
import clsx from 'clsx'
import { formatBytes } from '../../lib/utils'
import ProgressBar from './ProgressBar'

/**
 * SenderFileTable
 *
 * Shows the sender's file list in two distinct modes:
 *
 * ── IDLE (before sharing starts) ──────────────────────────────────────
 * Shows a "Remove" button on every file row.
 * Clicking it calls onRemoveFile(index) which splices the file out of
 * selectedFiles — the transfer hasn't started so there is no engine to
 * notify. This is a pure React state operation, zero cost.
 *
 * ── ACTIVE (transfer in progress) ────────────────────────────────────
 * Shows a labelled "Cancel" button on files that are pending or sending.
 * Clicking it calls onSkipFile(index) → engine.skipFile(index) → Set.add()
 * at the engine's next yield point. Other files keep transferring
 * uninterrupted. Done or already-skipped files show a badge instead.
 *
 * Props:
 *   fileList      — array of { path, name, size, status }
 *   fileProgress  — number[] — per-file 0–100 (from first active receiver)
 *   isActive      — boolean — true while transfer is running
 *   onRemoveFile  — (index) => void — idle phase remove
 *   onSkipFile    — (index) => void — active phase skip
 */
export default function SenderFileTable({
  fileList     = [],
  fileProgress = [],
  isActive     = false,
  onRemoveFile,
  onSkipFile,
}) {
  if (!fileList.length) return null

  const skippedCount = fileList.filter((f) => f.status === 'skipped').length

  return (
    <div className="card overflow-hidden animate-slide-up">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-heading font-semibold text-sm text-ink">
            {isActive ? 'Transfer Progress' : 'Selected Files'}
          </span>
          {!isActive && (
            <span className="text-[10px] font-medium text-ink-faint bg-surface-muted px-2 py-0.5 rounded-full">
              Click × to remove before sharing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>{fileList.length} file{fileList.length !== 1 ? 's' : ''}</span>
          {skippedCount > 0 && (
            <span className="text-ink-faint">· {skippedCount} cancelled</span>
          )}
        </div>
      </div>

      {/* ── File rows ─────────────────────────────────────────────── */}
      <div className="divide-y divide-surface-border max-h-80 overflow-y-auto">
        {fileList.map((file, i) => {
          const status    = file.status || 'pending'
          const isSkipped = status === 'skipped'
          const isDone    = status === 'done'
          const isSending = status === 'sending'
          const isPending = status === 'pending'
          const progress  = fileProgress[i] ?? 0

          return (
            <div
              key={i}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 transition-colors group',
                isSkipped ? 'opacity-40 bg-surface-muted/10' : 'hover:bg-surface-muted/20'
              )}
            >
              {/* ── Status indicator ──────────────────────────────── */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone && (
                  <svg className="w-4 h-4 text-status-connected" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
                {isSkipped && (
                  <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                )}
                {isSending && (
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-dot" />
                )}
                {isPending && !isActive && (
                  <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                )}
                {isPending && isActive && (
                  <span className="w-2 h-2 rounded-full bg-ink-faint" />
                )}
              </div>

              {/* ── File info ─────────────────────────────────────── */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <p
                  className={clsx(
                    'text-xs font-mono truncate',
                    isSkipped ? 'line-through text-ink-faint' : 'text-ink'
                  )}
                  title={file.path}
                >
                  {file.path}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-faint font-mono">
                    {formatBytes(file.size)}
                  </span>
                  {isDone && (
                    <span className="text-[10px] text-status-connected font-medium">Sent</span>
                  )}
                  {isSkipped && (
                    <span className="text-[10px] text-ink-faint font-medium">Cancelled</span>
                  )}
                </div>
              </div>

              {/* ── Progress bar (while sending) ──────────────────── */}
              {isSending && (
                <div className="flex-shrink-0 w-24 space-y-1">
                  <ProgressBar value={progress} size="sm" />
                  <span className="text-[10px] text-ink-faint font-mono block text-right">
                    {progress}%
                  </span>
                </div>
              )}

              {/* ── ACTION BUTTONS ────────────────────────────────── */}

              {/* IDLE: Remove button — always visible per row, labelled */}
              {!isActive && onRemoveFile && (
                <button
                  onClick={() => onRemoveFile(i)}
                  className={clsx(
                    'flex-shrink-0 flex items-center gap-1.5',
                    'text-xs font-medium px-2.5 py-1.5 rounded-lg',
                    'text-status-error bg-status-error/10 border border-status-error/20',
                    'hover:bg-status-error hover:text-white',
                    'transition-all duration-150'
                  )}
                  title={`Remove ${file.name} from selection`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  Remove
                </button>
              )}

              {/* ACTIVE — pending: Cancel before it starts */}
              {isActive && isPending && onSkipFile && (
                <button
                  onClick={() => onSkipFile(i)}
                  className={clsx(
                    'flex-shrink-0 flex items-center gap-1.5',
                    'text-xs font-medium px-2.5 py-1.5 rounded-lg',
                    'text-status-error bg-status-error/10 border border-status-error/20',
                    'hover:bg-status-error hover:text-white',
                    'transition-all duration-150'
                  )}
                  title={`Cancel ${file.name}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  Cancel
                </button>
              )}

              {/* ACTIVE — sending: Cancel mid-transfer */}
              {isActive && isSending && onSkipFile && (
                <button
                  onClick={() => onSkipFile(i)}
                  className={clsx(
                    'flex-shrink-0 flex items-center gap-1.5',
                    'text-xs font-medium px-2.5 py-1.5 rounded-lg',
                    'text-status-error bg-status-error/10 border border-status-error/20',
                    'hover:bg-status-error hover:text-white',
                    'transition-all duration-150 animate-pulse'
                  )}
                  title={`Cancel ${file.name} mid-transfer`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1"
                      strokeWidth={2} strokeLinecap="round"/>
                  </svg>
                  Stop
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
