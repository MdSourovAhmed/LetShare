import React from 'react'
import { useSender }                from '../hooks/useSender'
import DropZone                     from '@letshare/core/components/ui/DropZone'
import ReceiverCard                 from '@letshare/core/components/ui/ReceiverCard'
import SenderFileTable              from '@letshare/core/components/ui/SenderFileTable'
import SessionSummary               from '@letshare/core/components/ui/SessionSummary'
import StatusBadge                  from '@letshare/core/components/ui/StatusBadge'
import ShareLinkBox                 from '../components/ui/ShareLinkBox'

function phaseToStatus(phase) {
  if (phase === 'done')    return 'connected'
  if (phase === 'waiting') return 'connecting'
  if (phase === 'active')  return 'connected'
  return 'idle'
}

export default function SendPage() {
  const {
    state, selectedFiles,
    handleFilesSelected, createSession,
    copyLink, skipFile, cancelReceiver, reset,
  } = useSender()

  const { phase, shareLink, statusText, receivers, fileList, totalSize } = state
  const isLocked    = phase === 'waiting' || phase === 'active'
  const showReset   = phase === 'done'    || phase === 'error'
  const activeCount = receivers.filter((r) => r.phase !== 'error').length
  const allDone     = phase === 'done' && receivers.length > 0

  // For the SenderFileTable progress indicator, show the first active receiver's
  // per-file progress. If no receivers yet, everything is 0.
  const firstActiveReceiver = receivers.find((r) => r.phase === 'transferring')
  const fileProgress = firstActiveReceiver?.fileProgress ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">Send Files</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Select files or a folder. Multiple receivers can connect to the same link simultaneously.
        </p>
      </div>

      {/* File picker + create session */}
      <div className="card p-6 space-y-5">
        <DropZone
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          disabled={isLocked}
        />

        <button
          onClick={createSession}
          disabled={!selectedFiles.length || isLocked}
          className="btn-primary w-full py-3.5"
        >
          {phase === 'waiting' ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Waiting for receivers…
            </>
          ) : phase === 'active' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
              {activeCount} receiver{activeCount !== 1 ? 's' : ''} connected
            </>
          ) : phase === 'done' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              All done!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
              Create Share Link
            </>
          )}
        </button>

        <div className="flex items-center justify-between">
          <StatusBadge type={phaseToStatus(phase)} label={statusText} />
          {showReset && (
            <button onClick={reset} className="btn-secondary text-xs py-1.5 px-3">
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Share link */}
      {shareLink && <ShareLinkBox link={shareLink} onCopy={copyLink} />}

      {/* File list with per-file skip buttons */}
      {fileList.length > 0 && isLocked && (
        <SenderFileTable
          fileList={fileList}
          fileProgress={fileProgress}
          onSkipFile={skipFile}
        />
      )}

      {/* Session summary */}
      {allDone && (
        <SessionSummary receivers={receivers} totalSize={totalSize} fileList={fileList} />
      )}

      {/* Live receiver cards with cancel-receiver button */}
      {receivers.length > 0 && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-xs text-ink-muted uppercase tracking-wider">
              Receivers
            </h2>
            <span className="text-xs text-ink-faint">
              {receivers.filter((r) => r.phase === 'done').length} / {receivers.length} complete
            </span>
          </div>
          <div className="space-y-3">
            {receivers.map((r) => (
              <ReceiverCard
                key={r.socketId}
                receiver={r}
                fileList={fileList}
                totalSize={totalSize}
                onCancelReceiver={
                  r.phase === 'transferring' || r.phase === 'connecting'
                    ? () => cancelReceiver(r.socketId)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}