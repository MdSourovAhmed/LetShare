import React, { useEffect, useState, useCallback } from 'react'
import { formatBytes, formatSpeed, formatDuration } from '../../../lib/utils'
import { getAllTransfers, deleteTransfer, clearTransfers } from '../../../lib/transferDB'
import {
  ThroughputChart,
  DurationBarChart,
  SpeedScatterPlot,
  BackpressureChart,
} from './StatsChart'

// ── Small reusable pieces ─────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = false }) {
  return (
    <div className="bg-surface-muted rounded-xl px-4 py-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`text-xl font-heading font-bold ${accent ? 'text-brand-400' : 'text-ink'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-ink-faint font-mono">{sub}</p>}
    </div>
  )
}

function ModeBadge({ mode }) {
  return (
    <span className={`
      inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full
      ${mode === 'lan'
        ? 'bg-status-connected/10 text-status-connected border border-status-connected/20'
        : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${mode === 'lan' ? 'bg-status-connected' : 'bg-brand-400'}`} />
      {mode.toUpperCase()}
    </span>
  )
}

function RoleBadge({ role }) {
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full
      bg-surface-border text-ink-muted border border-surface-border">
      {role}
    </span>
  )
}

// ── Aggregate stats across a set of records ───────────────────────────────────
function aggregate(records) {
  if (!records.length) return null
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  return {
    count:           records.length,
    totalBytes:      records.reduce((s, r) => s + r.totalBytes, 0),
    avgDurationMs:   avg(records.map((r) => r.durationMs)),
    avgSpeedBps:     avg(records.map((r) => r.avgSpeedBps)),
    peakSpeedBps:    Math.max(...records.map((r) => r.peakSpeedBps)),
    avgConnMs:       avg(records.filter((r) => r.connectionMs).map((r) => r.connectionMs)),
    avgPauses:       avg(records.map((r) => r.backpressurePauses)),
    avgPauseTotalMs: avg(records.map((r) => r.backpressureTotalMs)),
    avgRttMs:        avg(records.filter((r) => r.rttMs).map((r) => r.rttMs)),
  }
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function ComparisonDashboard() {
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(new Set())
  const [filterMode, setFilterMode] = useState('all')   // 'all' | 'internet' | 'lan'
  const [filterRole, setFilterRole] = useState('all')   // 'all' | 'sender' | 'receiver'
  const [activeTab,  setActiveTab]  = useState('overview')

  const load = useCallback(async () => {
    setLoading(true)
    const all = await getAllTransfers()
    setRecords(all)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = records.filter((r) =>
    (filterMode === 'all' || r.mode === filterMode) &&
    (filterRole === 'all' || r.role === filterRole)
  )

  const forChart = selected.size > 0
    ? filtered.filter((r) => selected.has(r.id))
    : filtered

  const internetRecords = filtered.filter((r) => r.mode === 'internet')
  const lanRecords      = filtered.filter((r) => r.mode === 'lan')
  const aggInternet     = aggregate(internetRecords)
  const aggLan          = aggregate(lanRecords)

  const handleDelete = async (id) => {
    await deleteTransfer(id)
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    load()
  }

  const handleClearAll = async () => {
    if (!window.confirm('Delete all transfer records?')) return
    await clearTransfers()
    setSelected(new Set())
    load()
  }

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const tabs = ['overview', 'throughput', 'comparison', 'detail']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-ink-muted">
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading transfer history…
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
            Transfer Analytics
          </h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {records.length} session{records.length !== 1 ? 's' : ''} recorded
            {selected.size > 0 && ` · ${selected.size} selected`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load} className="btn-secondary text-xs py-1.5 px-3">
            Refresh
          </button>
          {records.length > 0 && (
            <button onClick={handleClearAll}
              className="text-xs text-status-error hover:text-white hover:bg-status-error/80 bg-status-error/10 border border-status-error/20 px-3 py-1.5 rounded-lg transition-all">
              Clear all
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-muted text-ink-faint flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">No transfer records yet</p>
          <p className="text-xs text-ink-muted">
            Complete a file transfer and the stats will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* ── Filters ──────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex bg-surface-muted rounded-xl p-0.5 border border-surface-border">
              {['all', 'internet', 'lan'].map((m) => (
                <button key={m} onClick={() => setFilterMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterMode === m
                      ? 'bg-surface-card text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}>
                  {m === 'all' ? 'All modes' : m.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex bg-surface-muted rounded-xl p-0.5 border border-surface-border">
              {['all', 'sender', 'receiver'].map((r) => (
                <button key={r} onClick={() => setFilterRole(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterRole === r
                      ? 'bg-surface-card text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}>
                  {r === 'all' ? 'All roles' : r}
                </button>
              ))}
            </div>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())}
                className="text-xs text-ink-muted hover:text-ink underline">
                Clear selection
              </button>
            )}
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="flex border-b border-surface-border gap-1">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-brand-400 text-brand-400'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}>
                {tab}
              </button>
            ))}
          </div>

          {/* ══ OVERVIEW TAB ═════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Side-by-side aggregate cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Internet', agg: aggInternet, color: 'text-brand-400', dot: 'bg-brand-400' },
                  { label: 'LAN',      agg: aggLan,      color: 'text-status-connected', dot: 'bg-status-connected' },
                ].map(({ label, agg, color, dot }) => (
                  <div key={label} className="card p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className={`font-heading font-bold text-sm ${color}`}>{label}</span>
                      <span className="text-xs text-ink-faint ml-auto">
                        {agg?.count ?? 0} run{agg?.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {agg ? (
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="Avg speed"
                          value={formatSpeed(agg.avgSpeedBps)} accent />
                        <MetricCard label="Peak speed"
                          value={formatSpeed(agg.peakSpeedBps)} />
                        <MetricCard label="Avg duration"
                          value={formatDuration(agg.avgDurationMs / 1000)} />
                        <MetricCard label="Conn. setup"
                          value={agg.avgConnMs ? `${Math.round(agg.avgConnMs)}ms` : '—'} />
                        <MetricCard label="Data transferred"
                          value={formatBytes(agg.totalBytes)} />
                        <MetricCard label="Avg pauses"
                          value={`${Math.round(agg.avgPauses)}`}
                          sub={`${Math.round(agg.avgPauseTotalMs)}ms total`} />
                        {agg.avgRttMs > 0 && (
                          <MetricCard label="Avg RTT"
                            value={`${Math.round(agg.avgRttMs)}ms`} />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-faint italic">No runs yet</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick comparison table */}
              {aggInternet && aggLan && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-3 border-b border-surface-border">
                    <h3 className="font-heading font-semibold text-sm text-ink">
                      Internet vs LAN — head to head
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-border bg-surface-muted/40">
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">Metric</th>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-brand-400 uppercase tracking-wider">Internet</th>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-status-connected uppercase tracking-wider">LAN</th>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">Winner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {[
                          {
                            label:    'Avg speed',
                            internet: formatSpeed(aggInternet.avgSpeedBps),
                            lan:      formatSpeed(aggLan.avgSpeedBps),
                            winner:   aggLan.avgSpeedBps > aggInternet.avgSpeedBps ? 'lan' : 'internet',
                          },
                          {
                            label:    'Peak speed',
                            internet: formatSpeed(aggInternet.peakSpeedBps),
                            lan:      formatSpeed(aggLan.peakSpeedBps),
                            winner:   aggLan.peakSpeedBps > aggInternet.peakSpeedBps ? 'lan' : 'internet',
                          },
                          {
                            label:    'Avg duration',
                            internet: formatDuration(aggInternet.avgDurationMs / 1000),
                            lan:      formatDuration(aggLan.avgDurationMs / 1000),
                            winner:   aggLan.avgDurationMs < aggInternet.avgDurationMs ? 'lan' : 'internet',
                          },
                          {
                            label:    'Conn. setup',
                            internet: aggInternet.avgConnMs ? `${Math.round(aggInternet.avgConnMs)}ms` : '—',
                            lan:      aggLan.avgConnMs ? `${Math.round(aggLan.avgConnMs)}ms` : '—',
                            winner:   (aggLan.avgConnMs || Infinity) < (aggInternet.avgConnMs || Infinity) ? 'lan' : 'internet',
                          },
                          {
                            label:    'Buffer pauses',
                            internet: `${Math.round(aggInternet.avgPauses)} (${Math.round(aggInternet.avgPauseTotalMs)}ms)`,
                            lan:      `${Math.round(aggLan.avgPauses)} (${Math.round(aggLan.avgPauseTotalMs)}ms)`,
                            winner:   aggLan.avgPauseTotalMs < aggInternet.avgPauseTotalMs ? 'lan' : 'internet',
                          },
                        ].map(({ label, internet, lan, winner }) => (
                          <tr key={label} className="hover:bg-surface-muted/20 transition-colors">
                            <td className="px-5 py-3 text-xs text-ink-muted font-medium">{label}</td>
                            <td className={`px-5 py-3 text-xs font-mono ${winner === 'internet' ? 'text-brand-400 font-bold' : 'text-ink'}`}>
                              {internet}
                            </td>
                            <td className={`px-5 py-3 text-xs font-mono ${winner === 'lan' ? 'text-status-connected font-bold' : 'text-ink'}`}>
                              {lan}
                            </td>
                            <td className="px-5 py-3">
                              <ModeBadge mode={winner} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ THROUGHPUT TAB ═══════════════════════════════════════════════ */}
          {activeTab === 'throughput' && (
            <div className="space-y-5">
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold text-sm text-ink">
                    Speed over time
                  </h3>
                  <p className="text-xs text-ink-faint">
                    {selected.size > 0 ? `${selected.size} selected` : 'All filtered runs overlaid'}
                  </p>
                </div>
                <ThroughputChart records={forChart} width={560} height={140} />
              </div>

              <div className="card p-5 space-y-4">
                <h3 className="font-heading font-semibold text-sm text-ink">
                  Time to complete
                </h3>
                <DurationBarChart records={forChart} width={560} height={140} />
              </div>

              <div className="card p-5 space-y-4">
                <h3 className="font-heading font-semibold text-sm text-ink">
                  Backpressure pauses
                  <span className="text-xs text-ink-muted font-normal ml-2">
                    time the engine spent waiting for the data channel to drain
                  </span>
                </h3>
                <BackpressureChart records={forChart} width={560} />
              </div>
            </div>
          )}

          {/* ══ COMPARISON TAB ═══════════════════════════════════════════════ */}
          {activeTab === 'comparison' && (
            <div className="space-y-5">
              <div className="card p-5 space-y-4">
                <h3 className="font-heading font-semibold text-sm text-ink">
                  Speed vs transfer size
                </h3>
                <p className="text-xs text-ink-muted">
                  Each dot is one run. Higher = faster. Right = larger file.
                  Good performance: dots cluster top-right.
                </p>
                <SpeedScatterPlot records={filtered} width={560} height={180} />
                <div className="flex gap-4">
                  {[{ mode: 'internet', color: '#00aee6' }, { mode: 'lan', color: '#22c55e' }].map(({ mode, color }) => (
                    <div key={mode} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs text-ink-muted">{mode.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Efficiency metric: ratio of avg speed to peak speed */}
              {filtered.length > 0 && (
                <div className="card p-5 space-y-4">
                  <h3 className="font-heading font-semibold text-sm text-ink">
                    Speed consistency
                    <span className="text-xs text-ink-muted font-normal ml-2">
                      avg ÷ peak — closer to 100% means steadier throughput
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {filtered.map((r) => {
                      const consistency = r.peakSpeedBps > 0
                        ? Math.round((r.avgSpeedBps / r.peakSpeedBps) * 100)
                        : 0
                      const color = r.mode === 'lan' ? '#22c55e' : '#00aee6'
                      return (
                        <div key={r.id} className="flex items-center gap-3">
                          <ModeBadge mode={r.mode} />
                          <RoleBadge role={r.role} />
                          <div className="flex-1 bg-surface-muted rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${consistency}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-xs font-mono text-ink-muted w-10 text-right">
                            {consistency}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ DETAIL TAB ════════════════════════════════════════════════════ */}
          {activeTab === 'detail' && (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted">
                Click a row to select it for chart overlay. Click again to deselect.
              </p>
              {filtered.map((r) => (
                <div
                  key={r.id}
                  onClick={() => toggleSelect(r.id)}
                  className={`card p-4 cursor-pointer transition-all duration-150 ${
                    selected.has(r.id)
                      ? 'border-brand-500/50 bg-brand-500/5'
                      : 'hover:border-surface-muted'
                  }`}
                >
                  {/* Row header */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ModeBadge mode={r.mode} />
                      <RoleBadge role={r.role} />
                      <span className="text-[10px] text-ink-faint font-mono">
                        {new Date(r.timestamp).toLocaleString()}
                      </span>
                      {r.outcome !== 'done' && (
                        <span className="text-[10px] text-status-error font-medium">
                          {r.outcome}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                      className="text-ink-faint hover:text-status-error transition-colors text-xs"
                      title="Delete this record"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
                    {[
                      { label: 'Size',      value: formatBytes(r.totalBytes) },
                      { label: 'Duration',  value: formatDuration(r.durationMs / 1000) },
                      { label: 'Avg speed', value: formatSpeed(r.avgSpeedBps) },
                      { label: 'Peak',      value: formatSpeed(r.peakSpeedBps) },
                      { label: 'Chunks',    value: r.chunkCount.toLocaleString() },
                      { label: 'Pauses',    value: `${r.backpressurePauses} (${Math.round(r.backpressureTotalMs)}ms)` },
                      r.connectionMs && { label: 'Conn. setup', value: `${Math.round(r.connectionMs)}ms` },
                      r.rttMs        && { label: 'RTT',         value: `${r.rttMs}ms` },
                    ].filter(Boolean).map(({ label, value }) => (
                      <div key={label} className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
                        <p className="text-xs font-mono text-ink">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-file breakdown */}
                  {r.files?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-border space-y-1.5">
                      {r.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className={`text-[10px] font-mono truncate flex-1 ${
                            f.status === 'skipped' ? 'line-through text-ink-faint' : 'text-ink-muted'
                          }`} title={f.path}>
                            {f.path}
                          </span>
                          <span className="text-[10px] font-mono text-ink-faint flex-shrink-0">
                            {formatBytes(f.size)}
                          </span>
                          {f.durationMs > 0 && (
                            <span className="text-[10px] font-mono text-ink-faint flex-shrink-0">
                              {formatDuration(f.durationMs / 1000)}
                            </span>
                          )}
                          <span className={`text-[10px] font-mono flex-shrink-0 ${
                            f.status === 'done'    ? 'text-status-connected' :
                            f.status === 'skipped' ? 'text-ink-faint'        : 'text-status-error'
                          }`}>
                            {f.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}



// import React, { useEffect, useState, useCallback } from 'react'
// import { formatBytes, formatSpeed, formatDuration } from '../../../lib/utils'
// import { getAllTransfers, deleteTransfer, clearTransfers } from '../../../lib/transferDB'
// import {
//   ThroughputChart,
//   DurationBarChart,
//   SpeedScatterPlot,
//   BackpressureChart,
// } from './StatsChart'

// // ── Small reusable pieces ─────────────────────────────────────────────────────

// function MetricCard({ label, value, sub, accent = false }) {
//   return (
//     <div className="bg-surface-muted rounded-xl px-4 py-3 space-y-1">
//       <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
//       <p className={`text-xl font-heading font-bold ${accent ? 'text-brand-400' : 'text-ink'}`}>
//         {value}
//       </p>
//       {sub && <p className="text-[11px] text-ink-faint font-mono">{sub}</p>}
//     </div>
//   )
// }

// function ModeBadge({ mode }) {
//   return (
//     <span className={`
//       inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full
//       ${mode === 'lan'
//         ? 'bg-status-connected/10 text-status-connected border border-status-connected/20'
//         : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'}
//     `}>
//       <span className={`w-1.5 h-1.5 rounded-full ${mode === 'lan' ? 'bg-status-connected' : 'bg-brand-400'}`} />
//       {mode.toUpperCase()}
//     </span>
//   )
// }

// function RoleBadge({ role }) {
//   return (
//     <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full
//       bg-surface-border text-ink-muted border border-surface-border">
//       {role}
//     </span>
//   )
// }

// // ── Aggregate stats across a set of records ───────────────────────────────────
// function aggregate(records) {
//   if (!records.length) return null
//   const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
//   return {
//     count:           records.length,
//     totalBytes:      records.reduce((s, r) => s + r.totalBytes, 0),
//     avgDurationMs:   avg(records.map((r) => r.durationMs)),
//     avgSpeedBps:     avg(records.map((r) => r.avgSpeedBps)),
//     peakSpeedBps:    Math.max(...records.map((r) => r.peakSpeedBps)),
//     avgConnMs:       avg(records.filter((r) => r.connectionMs).map((r) => r.connectionMs)),
//     avgPauses:       avg(records.map((r) => r.backpressurePauses)),
//     avgPauseTotalMs: avg(records.map((r) => r.backpressureTotalMs)),
//     avgRttMs:        avg(records.filter((r) => r.rttMs).map((r) => r.rttMs)),
//   }
// }

// // ── Main dashboard ────────────────────────────────────────────────────────────

// export default function ComparisonDashboard() {
//   const [records,    setRecords]    = useState([])
//   const [loading,    setLoading]    = useState(true)
//   const [selected,   setSelected]   = useState(new Set())
//   const [filterMode, setFilterMode] = useState('all')   // 'all' | 'internet' | 'lan'
//   const [filterRole, setFilterRole] = useState('all')   // 'all' | 'sender' | 'receiver'
//   const [activeTab,  setActiveTab]  = useState('overview')

//   const load = useCallback(async () => {
//     setLoading(true)
//     const all = await getAllTransfers()
//     setRecords(all)
//     setLoading(false)
//   }, [])

//   useEffect(() => { load() }, [load])

//   const filtered = records.filter((r) =>
//     (filterMode === 'all' || r.mode === filterMode) &&
//     (filterRole === 'all' || r.role === filterRole)
//   )

//   const forChart = selected.size > 0
//     ? filtered.filter((r) => selected.has(r.id))
//     : filtered

//   const internetRecords = filtered.filter((r) => r.mode === 'internet')
//   const lanRecords      = filtered.filter((r) => r.mode === 'lan')
//   const aggInternet     = aggregate(internetRecords)
//   const aggLan          = aggregate(lanRecords)

//   const handleDelete = async (id) => {
//     await deleteTransfer(id)
//     setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
//     load()
//   }

//   const handleClearAll = async () => {
//     if (!window.confirm('Delete all transfer records?')) return
//     await clearTransfers()
//     setSelected(new Set())
//     load()
//   }

//   const toggleSelect = (id) => {
//     setSelected((prev) => {
//       const n = new Set(prev)
//       n.has(id) ? n.delete(id) : n.add(id)
//       return n
//     })
//   }

//   const tabs = ['overview', 'throughput', 'comparison', 'detail']

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center py-20 gap-3 text-ink-muted">
//         <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
//           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
//           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
//         </svg>
//         Loading transfer history…
//       </div>
//     )
//   }

//   return (
//     <div className="space-y-6 animate-slide-up">

//       {/* ── Header ─────────────────────────────────────────────────────────── */}
//       <div className="flex items-start justify-between gap-4">
//         <div>
//           <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
//             Transfer Analytics
//           </h1>
//           <p className="text-ink-muted text-sm mt-0.5">
//             {records.length} session{records.length !== 1 ? 's' : ''} recorded
//             {selected.size > 0 && ` · ${selected.size} selected`}
//           </p>
//         </div>
//         <div className="flex items-center gap-2 flex-shrink-0">
//           <button onClick={load} className="btn-secondary text-xs py-1.5 px-3">
//             Refresh
//           </button>
//           {records.length > 0 && (
//             <button onClick={handleClearAll}
//               className="text-xs text-status-error hover:text-white hover:bg-status-error/80 bg-status-error/10 border border-status-error/20 px-3 py-1.5 rounded-lg transition-all">
//               Clear all
//             </button>
//           )}
//         </div>
//       </div>

//       {records.length === 0 ? (
//         <div className="card p-12 text-center space-y-3">
//           <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-muted text-ink-faint flex items-center justify-center">
//             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
//                 d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
//             </svg>
//           </div>
//           <p className="text-sm font-medium text-ink">No transfer records yet</p>
//           <p className="text-xs text-ink-muted">
//             Complete a file transfer and the stats will appear here automatically.
//           </p>
//         </div>
//       ) : (
//         <>
//           {/* ── Filters ──────────────────────────────────────────────────────── */}
//           <div className="flex flex-wrap gap-3 items-center">
//             <div className="flex bg-surface-muted rounded-xl p-0.5 border border-surface-border">
//               {['all', 'internet', 'lan'].map((m) => (
//                 <button key={m} onClick={() => setFilterMode(m)}
//                   className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
//                     filterMode === m
//                       ? 'bg-surface-card text-ink shadow-sm'
//                       : 'text-ink-muted hover:text-ink'
//                   }`}>
//                   {m === 'all' ? 'All modes' : m.toUpperCase()}
//                 </button>
//               ))}
//             </div>
//             <div className="flex bg-surface-muted rounded-xl p-0.5 border border-surface-border">
//               {['all', 'sender', 'receiver'].map((r) => (
//                 <button key={r} onClick={() => setFilterRole(r)}
//                   className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
//                     filterRole === r
//                       ? 'bg-surface-card text-ink shadow-sm'
//                       : 'text-ink-muted hover:text-ink'
//                   }`}>
//                   {r === 'all' ? 'All roles' : r}
//                 </button>
//               ))}
//             </div>
//             {selected.size > 0 && (
//               <button onClick={() => setSelected(new Set())}
//                 className="text-xs text-ink-muted hover:text-ink underline">
//                 Clear selection
//               </button>
//             )}
//           </div>

//           {/* ── Tabs ─────────────────────────────────────────────────────────── */}
//           <div className="flex border-b border-surface-border gap-1">
//             {tabs.map((tab) => (
//               <button key={tab} onClick={() => setActiveTab(tab)}
//                 className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
//                   activeTab === tab
//                     ? 'border-brand-400 text-brand-400'
//                     : 'border-transparent text-ink-muted hover:text-ink'
//                 }`}>
//                 {tab}
//               </button>
//             ))}
//           </div>

//           {/* ══ OVERVIEW TAB ═════════════════════════════════════════════════ */}
//           {activeTab === 'overview' && (
//             <div className="space-y-6">

//               {/* Side-by-side aggregate cards */}
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                 {[
//                   { label: 'Internet', agg: aggInternet, color: 'text-brand-400', dot: 'bg-brand-400' },
//                   { label: 'LAN',      agg: aggLan,      color: 'text-status-connected', dot: 'bg-status-connected' },
//                 ].map(({ label, agg, color, dot }) => (
//                   <div key={label} className="card p-5 space-y-4">
//                     <div className="flex items-center gap-2">
//                       <span className={`w-2 h-2 rounded-full ${dot}`} />
//                       <span className={`font-heading font-bold text-sm ${color}`}>{label}</span>
//                       <span className="text-xs text-ink-faint ml-auto">
//                         {agg?.count ?? 0} run{agg?.count !== 1 ? 's' : ''}
//                       </span>
//                     </div>
//                     {agg ? (
//                       <div className="grid grid-cols-2 gap-3">
//                         <MetricCard label="Avg speed"
//                           value={formatSpeed(agg.avgSpeedBps)} accent />
//                         <MetricCard label="Peak speed"
//                           value={formatSpeed(agg.peakSpeedBps)} />
//                         <MetricCard label="Avg duration"
//                           value={formatDuration(agg.avgDurationMs / 1000)} />
//                         <MetricCard label="Conn. setup"
//                           value={agg.avgConnMs ? `${Math.round(agg.avgConnMs)}ms` : '—'} />
//                         <MetricCard label="Data transferred"
//                           value={formatBytes(agg.totalBytes)} />
//                         <MetricCard label="Avg pauses"
//                           value={`${Math.round(agg.avgPauses)}`}
//                           sub={`${Math.round(agg.avgPauseTotalMs)}ms total`} />
//                         {agg.avgRttMs > 0 && (
//                           <MetricCard label="Avg RTT"
//                             value={`${Math.round(agg.avgRttMs)}ms`} />
//                         )}
//                       </div>
//                     ) : (
//                       <p className="text-xs text-ink-faint italic">No runs yet</p>
//                     )}
//                   </div>
//                 ))}
//               </div>

//               {/* Quick comparison table */}
//               {aggInternet && aggLan && (
//                 <div className="card overflow-hidden">
//                   <div className="px-5 py-3 border-b border-surface-border">
//                     <h3 className="font-heading font-semibold text-sm text-ink">
//                       Internet vs LAN — head to head
//                     </h3>
//                   </div>
//                   <div className="overflow-x-auto">
//                     <table className="w-full text-sm">
//                       <thead>
//                         <tr className="border-b border-surface-border bg-surface-muted/40">
//                           <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">Metric</th>
//                           <th className="text-left px-5 py-2.5 text-xs font-medium text-brand-400 uppercase tracking-wider">Internet</th>
//                           <th className="text-left px-5 py-2.5 text-xs font-medium text-status-connected uppercase tracking-wider">LAN</th>
//                           <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">Winner</th>
//                         </tr>
//                       </thead>
//                       <tbody className="divide-y divide-surface-border">
//                         {[
//                           {
//                             label:    'Avg speed',
//                             internet: formatSpeed(aggInternet.avgSpeedBps),
//                             lan:      formatSpeed(aggLan.avgSpeedBps),
//                             winner:   aggLan.avgSpeedBps > aggInternet.avgSpeedBps ? 'lan' : 'internet',
//                           },
//                           {
//                             label:    'Peak speed',
//                             internet: formatSpeed(aggInternet.peakSpeedBps),
//                             lan:      formatSpeed(aggLan.peakSpeedBps),
//                             winner:   aggLan.peakSpeedBps > aggInternet.peakSpeedBps ? 'lan' : 'internet',
//                           },
//                           {
//                             label:    'Avg duration',
//                             internet: formatDuration(aggInternet.avgDurationMs / 1000),
//                             lan:      formatDuration(aggLan.avgDurationMs / 1000),
//                             winner:   aggLan.avgDurationMs < aggInternet.avgDurationMs ? 'lan' : 'internet',
//                           },
//                           {
//                             label:    'Conn. setup',
//                             internet: aggInternet.avgConnMs ? `${Math.round(aggInternet.avgConnMs)}ms` : '—',
//                             lan:      aggLan.avgConnMs ? `${Math.round(aggLan.avgConnMs)}ms` : '—',
//                             winner:   (aggLan.avgConnMs || Infinity) < (aggInternet.avgConnMs || Infinity) ? 'lan' : 'internet',
//                           },
//                           {
//                             label:    'Buffer pauses',
//                             internet: `${Math.round(aggInternet.avgPauses)} (${Math.round(aggInternet.avgPauseTotalMs)}ms)`,
//                             lan:      `${Math.round(aggLan.avgPauses)} (${Math.round(aggLan.avgPauseTotalMs)}ms)`,
//                             winner:   aggLan.avgPauseTotalMs < aggInternet.avgPauseTotalMs ? 'lan' : 'internet',
//                           },
//                         ].map(({ label, internet, lan, winner }) => (
//                           <tr key={label} className="hover:bg-surface-muted/20 transition-colors">
//                             <td className="px-5 py-3 text-xs text-ink-muted font-medium">{label}</td>
//                             <td className={`px-5 py-3 text-xs font-mono ${winner === 'internet' ? 'text-brand-400 font-bold' : 'text-ink'}`}>
//                               {internet}
//                             </td>
//                             <td className={`px-5 py-3 text-xs font-mono ${winner === 'lan' ? 'text-status-connected font-bold' : 'text-ink'}`}>
//                               {lan}
//                             </td>
//                             <td className="px-5 py-3">
//                               <ModeBadge mode={winner} />
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </div>
//           )}

//           {/* ══ THROUGHPUT TAB ═══════════════════════════════════════════════ */}
//           {activeTab === 'throughput' && (
//             <div className="space-y-5">
//               <div className="card p-5 space-y-4">
//                 <div className="flex items-center justify-between">
//                   <h3 className="font-heading font-semibold text-sm text-ink">
//                     Speed over time
//                   </h3>
//                   <p className="text-xs text-ink-faint">
//                     {selected.size > 0 ? `${selected.size} selected` : 'All filtered runs overlaid'}
//                   </p>
//                 </div>
//                 <ThroughputChart records={forChart} width={560} height={140} />
//               </div>

//               <div className="card p-5 space-y-4">
//                 <h3 className="font-heading font-semibold text-sm text-ink">
//                   Time to complete
//                 </h3>
//                 <DurationBarChart records={forChart} width={560} height={140} />
//               </div>

//               <div className="card p-5 space-y-4">
//                 <h3 className="font-heading font-semibold text-sm text-ink">
//                   Backpressure pauses
//                   <span className="text-xs text-ink-muted font-normal ml-2">
//                     time the engine spent waiting for the data channel to drain
//                   </span>
//                 </h3>
//                 <BackpressureChart records={forChart} width={560} />
//               </div>
//             </div>
//           )}

//           {/* ══ COMPARISON TAB ═══════════════════════════════════════════════ */}
//           {activeTab === 'comparison' && (
//             <div className="space-y-5">
//               <div className="card p-5 space-y-4">
//                 <h3 className="font-heading font-semibold text-sm text-ink">
//                   Speed vs transfer size
//                 </h3>
//                 <p className="text-xs text-ink-muted">
//                   Each dot is one run. Higher = faster. Right = larger file.
//                   Good performance: dots cluster top-right.
//                 </p>
//                 <SpeedScatterPlot records={filtered} width={560} height={180} />
//                 <div className="flex gap-4">
//                   {[{ mode: 'internet', color: '#00aee6' }, { mode: 'lan', color: '#22c55e' }].map(({ mode, color }) => (
//                     <div key={mode} className="flex items-center gap-1.5">
//                       <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
//                       <span className="text-xs text-ink-muted">{mode.toUpperCase()}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {/* Efficiency metric: ratio of avg speed to peak speed */}
//               {filtered.length > 0 && (
//                 <div className="card p-5 space-y-4">
//                   <h3 className="font-heading font-semibold text-sm text-ink">
//                     Speed consistency
//                     <span className="text-xs text-ink-muted font-normal ml-2">
//                       avg ÷ peak — closer to 100% means steadier throughput
//                     </span>
//                   </h3>
//                   <div className="space-y-2">
//                     {filtered.map((r) => {
//                       const consistency = r.peakSpeedBps > 0
//                         ? Math.round((r.avgSpeedBps / r.peakSpeedBps) * 100)
//                         : 0
//                       const color = r.mode === 'lan' ? '#22c55e' : '#00aee6'
//                       return (
//                         <div key={r.id} className="flex items-center gap-3">
//                           <ModeBadge mode={r.mode} />
//                           <RoleBadge role={r.role} />
//                           <div className="flex-1 bg-surface-muted rounded-full h-2 overflow-hidden">
//                             <div className="h-full rounded-full transition-all"
//                               style={{ width: `${consistency}%`, backgroundColor: color }} />
//                           </div>
//                           <span className="text-xs font-mono text-ink-muted w-10 text-right">
//                             {consistency}%
//                           </span>
//                         </div>
//                       )
//                     })}
//                   </div>
//                 </div>
//               )}
//             </div>
//           )}

//           {/* ══ DETAIL TAB ════════════════════════════════════════════════════ */}
//           {activeTab === 'detail' && (
//             <div className="space-y-3">
//               <p className="text-xs text-ink-muted">
//                 Click a row to select it for chart overlay. Click again to deselect.
//               </p>
//               {filtered.map((r) => (
//                 <div
//                   key={r.id}
//                   onClick={() => toggleSelect(r.id)}
//                   className={`card p-4 cursor-pointer transition-all duration-150 ${
//                     selected.has(r.id)
//                       ? 'border-brand-500/50 bg-brand-500/5'
//                       : 'hover:border-surface-muted'
//                   }`}
//                 >
//                   {/* Row header */}
//                   <div className="flex items-center justify-between gap-3 flex-wrap">
//                     <div className="flex items-center gap-2 flex-wrap">
//                       <ModeBadge mode={r.mode} />
//                       <RoleBadge role={r.role} />
//                       <span className="text-[10px] text-ink-faint font-mono">
//                         {new Date(r.timestamp).toLocaleString()}
//                       </span>
//                       {r.outcome !== 'done' && (
//                         <span className="text-[10px] text-status-error font-medium">
//                           {r.outcome}
//                         </span>
//                       )}
//                     </div>
//                     <button
//                       onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
//                       className="text-ink-faint hover:text-status-error transition-colors text-xs"
//                       title="Delete this record"
//                     >
//                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
//                           d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
//                       </svg>
//                     </button>
//                   </div>

//                   {/* Stats grid */}
//                   <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
//                     {[
//                       { label: 'Size',      value: formatBytes(r.totalBytes) },
//                       { label: 'Duration',  value: formatDuration(r.durationMs / 1000) },
//                       { label: 'Avg speed', value: formatSpeed(r.avgSpeedBps) },
//                       { label: 'Peak',      value: formatSpeed(r.peakSpeedBps) },
//                       { label: 'Chunks',    value: r.chunkCount.toLocaleString() },
//                       { label: 'Pauses',    value: `${r.backpressurePauses} (${Math.round(r.backpressureTotalMs)}ms)` },
//                       r.connectionMs && { label: 'Conn. setup', value: `${Math.round(r.connectionMs)}ms` },
//                       r.rttMs        && { label: 'RTT',         value: `${r.rttMs}ms` },
//                     ].filter(Boolean).map(({ label, value }) => (
//                       <div key={label} className="space-y-0.5">
//                         <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
//                         <p className="text-xs font-mono text-ink">{value}</p>
//                       </div>
//                     ))}
//                   </div>

//                   {/* Per-file breakdown */}
//                   {r.files?.length > 0 && (
//                     <div className="mt-3 pt-3 border-t border-surface-border space-y-1.5">
//                       {r.files.map((f, i) => (
//                         <div key={i} className="flex items-center gap-3">
//                           <span className={`text-[10px] font-mono truncate flex-1 ${
//                             f.status === 'skipped' ? 'line-through text-ink-faint' : 'text-ink-muted'
//                           }`} title={f.path}>
//                             {f.path}
//                           </span>
//                           <span className="text-[10px] font-mono text-ink-faint flex-shrink-0">
//                             {formatBytes(f.size)}
//                           </span>
//                           {f.durationMs > 0 && (
//                             <span className="text-[10px] font-mono text-ink-faint flex-shrink-0">
//                               {formatDuration(f.durationMs / 1000)}
//                             </span>
//                           )}
//                           <span className={`text-[10px] font-mono flex-shrink-0 ${
//                             f.status === 'done'    ? 'text-status-connected' :
//                             f.status === 'skipped' ? 'text-ink-faint'        : 'text-status-error'
//                           }`}>
//                             {f.status}
//                           </span>
//                         </div>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </>
//       )}
//     </div>
//   )
// }