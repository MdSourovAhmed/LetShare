


import React, { useState } from 'react'
import clsx from 'clsx'
import DropZone        from '@letshare/core/components/ui/DropZone'
import SenderFileTable from '@letshare/core/components/ui/SenderFileTable'
import SessionSummary  from '@letshare/core/components/ui/SessionSummary'
import TransferLog     from './TransferLog'

export default function SharePanel({ shareSession }) {
  const {
    phase, receivers, fileList, selectedFiles, totalSize,
    handleFilesSelected, removeFile, announce, skipFile, closeSession,
  } = shareSession

  const [mode,   setMode]   = useState('open')
  const [pin,    setPin]    = useState('')
  const [pinErr, setPinErr] = useState('')

  const isIdle   = phase === 'idle'
  const isActive = phase === 'active'
  const isDone   = phase === 'done'

  // Progress for the first actively-transferring receiver
  const firstActive    = receivers.find((r) => r.phase === 'transferring')
  const fileProgress   = firstActive?.fileProgress ?? []

  const handleAnnounce = () => {
    if (mode === 'pin' && pin.length < 4) { setPinErr('PIN must be at least 4 digits.'); return }
    setPinErr('')
    announce({ mode, pin: mode === 'pin' ? pin : null })
  }

  return (
    <div className="space-y-5">

      {/* ── IDLE: file picker + mode selector + announce ──────────────────── */}
      {isIdle && (
        <>
          <DropZone
            onFilesSelected={handleFilesSelected}
            selectedFiles={selectedFiles}
            disabled={false}
          />

          {/* File list with Remove buttons — always visible after picking */}
          {fileList.length > 0 && (
            <SenderFileTable
              fileList={fileList}
              isActive={false}
              onRemoveFile={removeFile}
            />
          )}

          {selectedFiles.length > 0 && (
            <>
              {/* Access mode */}
              <div className="card p-4 space-y-3">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
                  Access mode
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      value: 'open', label: 'Open', desc: 'Anyone can download',
                      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/>
                    },
                    {
                      value: 'pin',  label: 'PIN',  desc: 'Require a PIN code',
                      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    },
                  ].map(({ value, label, desc, icon }) => (
                    <button
                      key={value}
                      onClick={() => setMode(value)}
                      className={clsx(
                        'p-3 rounded-xl border text-left transition-all duration-150',
                        mode === value
                          ? 'border-brand-500/60 bg-brand-500/10'
                          : 'border-surface-border hover:border-surface-muted bg-surface-muted/30'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <svg className={clsx('w-4 h-4', mode === value ? 'text-brand-400' : 'text-ink-faint')}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {icon}
                        </svg>
                        <span className={clsx('text-sm font-semibold',
                          mode === value ? 'text-brand-400' : 'text-ink')}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">{desc}</p>
                    </button>
                  ))}
                </div>

                {mode === 'pin' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider">
                      Set PIN (4–8 digits)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      value={pin}
                      onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinErr('') }}
                      placeholder="e.g. 4821"
                      className="input-field w-full"
                    />
                    {pinErr && <p className="text-xs text-status-error">{pinErr}</p>}
                  </div>
                )}
              </div>

              <button onClick={handleAnnounce} className="btn-primary w-full py-3.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                </svg>
                Share to LAN
              </button>
            </>
          )}
        </>
      )}

      {/* ── ACTIVE / DONE: session info bar ──────────────────────────────── */}
      {(isActive || isDone) && (
        <div className={clsx(
          'card p-4 flex items-center justify-between gap-4',
          isDone && 'border-status-connected/30'
        )}>
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">
              {fileList.length} file{fileList.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-ink-muted">
              {isDone
                ? 'Session complete'
                : `${receivers.filter((r) => r.phase !== 'error').length} receiver${receivers.filter((r) => r.phase !== 'error').length !== 1 ? 's' : ''} connected`}
            </p>
          </div>
          <button onClick={closeSession} className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
            {isDone ? 'Share again' : 'Stop sharing'}
          </button>
        </div>
      )}

      {/* ── ACTIVE: file list with Cancel/Stop buttons ───────────────────── */}
      {isActive && fileList.length > 0 && (
        <SenderFileTable
          fileList={fileList}
          fileProgress={fileProgress}
          isActive={true}
          onSkipFile={skipFile}
        />
      )}

      {/* ── DONE: session summary ────────────────────────────────────────── */}
      {isDone && receivers.length > 0 && (
        <SessionSummary receivers={receivers} totalSize={totalSize} fileList={fileList} />
      )}

      {/* ── Live transfer log ─────────────────────────────────────────────── */}
      {(isActive || isDone) && (
        <TransferLog receivers={receivers} fileList={fileList} totalSize={totalSize} />
      )}
    </div>
  )
}
