import React, { useState, useCallback } from 'react'
import clsx from 'clsx'
import { useLobby }        from '../hooks/useLobby'
import { useShareSession } from '../hooks/useShareSession'
import { useJoinSession }  from '../hooks/useJoinSession'
import SharePanel          from '../components/lan/SharePanel'
import SessionCard         from '../components/lan/SessionCard'
import DownloadPanel       from '../components/lan/DownloadPanel'
import PINModal            from '../components/lan/PINModal'

// ── Name setup screen ────────────────────────────────────────────────────────
function NameSetup({ onJoin }) {
  const [name, setName] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 1) return
    onJoin(n)
  }

  return (
    <div className="max-w-sm mx-auto pt-16 space-y-8 animate-slide-up text-center">
      <div className="space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Join the LAN room
        </h1>
        <p className="text-ink-muted text-sm">
          Choose a display name so others on the network know who you are.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 text-left">
        <input
          type="text"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ahmed's MacBook"
          className="input-field w-full text-base"
          autoFocus
        />
        <button type="submit" disabled={!name.trim()}
          className="btn-primary w-full py-3">
          Enter room
        </button>
      </form>
    </div>
  )
}

// ── Peer presence strip ───────────────────────────────────────────────────────
function PeerStrip({ peers, mySocketId }) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
      {peers.map((p) => (
        <div key={p.socketId}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium flex-shrink-0 transition-all',
            p.socketId === mySocketId
              ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
              : 'border-surface-border bg-surface-muted text-ink-muted'
          )}>
          <span className="w-1.5 h-1.5 rounded-full bg-status-connected flex-shrink-0" />
          {p.name}
          {p.socketId === mySocketId && <span className="text-ink-faint">(you)</span>}
        </div>
      ))}
    </div>
  )
}

// ── Main lobby page ───────────────────────────────────────────────────────────
export default function LobbyPage() {
  const [displayName, setDisplayName] = useState('')
  const [activeTab, setActiveTab] = useState('lobby')  // 'lobby' | 'share' | 'download'

  // PIN modal state
  const [pinTarget,  setPinTarget]  = useState(null)   // session waiting for PIN
  const [pinError,   setPinError]   = useState('')

  const { peers, sessions, mySocketId, connected, getSocket } = useLobby(displayName)
  const shareSession = useShareSession(getSocket)
  const joinSession  = useJoinSession(getSocket)

  // ── Join flow ──────────────────────────────────────────────────────────────
  const handleJoinSession = useCallback((session) => {
    if (session.mode === 'pin') {
      setPinTarget(session)
      setPinError('')
    } else {
      joinSession.joinSession(session.sessionId, null)
      setActiveTab('download')
    }
  }, [joinSession])

  const handlePINSubmit = useCallback((pin) => {
    if (!pinTarget) return
    joinSession.joinSession(pinTarget.sessionId, pin)
    setPinTarget(null)
    setPinError('')
    setActiveTab('download')
  }, [pinTarget, joinSession])

  // Detect wrong PIN from join rejection
  React.useEffect(() => {
    if (joinSession.phase === 'error' && joinSession.error === 'Incorrect PIN.') {
      setPinTarget(sessions.find((s) => s.mode === 'pin') ?? null)
      setPinError('Incorrect PIN — try again.')
      setActiveTab('lobby')
    }
  }, [joinSession.phase, joinSession.error])

  // ── Not named yet ──────────────────────────────────────────────────────────
  if (!displayName) {
    return <NameSetup onJoin={setDisplayName} />
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'lobby',    label: 'Lobby',    count: sessions.length },
    { id: 'share',    label: 'Share',    count: null },
    { id: 'download', label: 'Download', count: joinSession.fileRows.length || null },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">

      {/* PIN modal */}
      {pinTarget && (
        <PINModal
          sessionLabel={pinTarget.label}
          onSubmit={handlePINSubmit}
          onCancel={() => { setPinTarget(null); setPinError('') }}
          error={pinError}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">LAN Room</h1>
          <p className="text-ink-muted mt-0.5 text-sm">
            {connected
              ? `${peers.length} device${peers.length !== 1 ? 's' : ''} online`
              : 'Connecting…'}
          </p>
        </div>
        <div className={clsx(
          'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border',
          connected
            ? 'border-status-connected/30 bg-status-connected/10 text-status-connected'
            : 'border-surface-border text-ink-faint'
        )}>
          <span className={clsx('w-1.5 h-1.5 rounded-full',
            connected ? 'bg-status-connected animate-pulse-dot' : 'bg-ink-faint')} />
          {connected ? 'letshare.local' : 'offline'}
        </div>
      </div>

      {/* Online peers strip */}
      {peers.length > 0 && (
        <PeerStrip peers={peers} mySocketId={mySocketId} />
      )}

      {/* Tab bar */}
      <div className="flex border-b border-surface-border gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-brand-400 text-brand-400'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={clsx(
                'text-[10px] font-mono px-1.5 py-0.5 rounded-full',
                activeTab === tab.id
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'bg-surface-muted text-ink-faint'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Lobby tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'lobby' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-muted text-ink-faint flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-ink">No active shares</p>
              <p className="text-xs text-ink-muted">
                Nobody is sharing files yet. Go to <strong>Share</strong> to start.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {sessions.map((s) => (
                <SessionCard
                  key={s.sessionId}
                  session={s}
                  isOwn={s.ownerSocketId === mySocketId}
                  onJoin={handleJoinSession}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Share tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'share' && (
        <SharePanel shareSession={shareSession} />
      )}

      {/* ── Download tab ───────────────────────────────────────────────────── */}
      {activeTab === 'download' && (
        <div>
          {joinSession.phase === 'idle' ? (
            <div className="card p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-muted text-ink-faint flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-ink">No active download</p>
              <p className="text-xs text-ink-muted">
                Go to <strong>Lobby</strong> and click Download on a shared session.
              </p>
            </div>
          ) : (
            <DownloadPanel
              joinSession={joinSession}
              onReset={() => { joinSession.reset(); setActiveTab('lobby') }}
            />
          )}
        </div>
      )}
    </div>
  )
}