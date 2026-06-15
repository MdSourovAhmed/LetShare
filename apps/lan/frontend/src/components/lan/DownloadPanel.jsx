import React from 'react'
import { formatBytes, formatSpeed, formatDuration } from '@letshare/core/lib/utils'
import ReceiveStatsPanel  from '@letshare/core/components/ui/ReceiveStatusPanel'
import ReceiverFileTable  from '@letshare/core/components/ui/ReceiverFileTable'
import StatusBadge        from '@letshare/core/components/ui/StatusBadge'

function phaseToStatus(phase) {
  if (phase === 'done')       return 'connected'
  if (phase === 'error')      return 'error'
  if (phase === 'receiving')  return 'connected'
  if (phase === 'connecting' || phase === 'joining') return 'connecting'
  return 'idle'
}

/**
 * Shown to the receiver after they join a session.
 * Displays transfer stats, progress, and per-file download buttons.
 */
export default function DownloadPanel({ joinSession: js, onReset }) {
  const {
    phase, statusText, error,
    fileRows, totalSize, totalReceived,
    speedBps, speedHistory, peakBps,
    startedAt, finishedAt,
  } = js

  const showStats = (phase === 'receiving' || phase === 'done') && totalSize > 0

  return (
    <div className="space-y-5">

      {/* Status card */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge type={phaseToStatus(phase)} label={statusText || 'Connecting…'} />
          <button onClick={onReset} className="btn-secondary text-xs py-1.5 px-3">
            Cancel
          </button>
        </div>

        {/* Error */}
        {phase === 'error' && error && (
          <div className="flex gap-3 p-3 rounded-xl bg-status-error/10 border border-status-error/20 text-status-error text-sm">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Connecting spinner */}
        {(phase === 'joining' || phase === 'connecting') && (
          <div className="flex items-center gap-3 text-ink-muted py-2">
            <div className="relative w-8 h-8 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-brand-500/20"/>
              <div className="absolute inset-0 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"/>
            </div>
            <p className="text-sm">Establishing WebRTC connection…</p>
          </div>
        )}
      </div>

      {/* Rich stats panel */}
      {showStats && (
        <ReceiveStatsPanel
          totalSize={totalSize}
          totalReceived={totalReceived}
          speedBps={speedBps}
          speedHistory={speedHistory}
          peakBps={peakBps}
          startedAt={startedAt}
          finishedAt={finishedAt}
          phase={phase}
        />
      )}

      {/* Success */}
      {phase === 'done' && (
        <div className="flex gap-3 p-4 rounded-xl bg-status-connected/10 border border-status-connected/20 text-status-connected text-sm animate-slide-up">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          <span>All files received — click Save below to download each one.</span>
        </div>
      )}

      {/* File table */}
      {fileRows.length > 0 && <ReceiverFileTable rows={fileRows} />}
    </div>
  )
}