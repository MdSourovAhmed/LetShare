/**
 * metricsWriter.js — Node.js InfluxDB line-protocol writer + local JSONL log
 *
 * Called once per transfer, from the /api/metrics route, after the beacon's
 * single post-transfer POST arrives. There is no "progress" write anymore —
 * the whole point of the single-shot beacon is that the only thing ever
 * written here is the final record of a transfer that has already finished.
 *
 * INFLUX_BUCKET intentionally has no shared default across apps — set it
 * per backend (.env) so Internet and LAN transfers land in separate
 * buckets and Grafana never needs cross-app filtering.
 *
 * METRICS_LOG_FILE — likewise set per backend (.env), one JSONL file per
 * app. Written FIRST, before the InfluxDB attempt, so a transfer's record
 * is never lost just because InfluxDB is unreachable or not configured —
 * the log file is the durable copy; InfluxDB/Grafana is the live view on
 * top of it. Format is one JSON object per line (newline-delimited JSON),
 * so it's trivially appendable, greppable, and loadable with
 * `pandas.read_json(path, lines=True)` for offline analysis.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const INFLUX_URL   = process.env.INFLUX_URL   || 'http://localhost:8086'
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''
const INFLUX_ORG   = process.env.INFLUX_ORG   || 'letshare'
// No default — each backend MUST set its own bucket (internet_transfers / lan_transfers)
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || null
const METRICS_LOG_FILE = process.env.METRICS_LOG_FILE || 'transfer_logs.jsonl'

const WRITE_URL = INFLUX_BUCKET
  ? `${INFLUX_URL}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=ms`
  : null

let logDirReady = null // memoised mkdir promise

/** Escape special chars in InfluxDB line-protocol tag values */
function escapeTag(str) {
  return String(str ?? '').replace(/[, =\\]/g, '\\$&')
}

/** Numeric field — omitted entirely if null/undefined/NaN so missing stats
 *  don't write 0 and skew Grafana averages. Keeps real zeros. */
function numField(name, value, integer = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null
  return `${name}=${Number(value)}${integer ? 'i' : ''}`
}

/** Append one JSON line. Never throws. */
async function logToFile(record) {
  if (!METRICS_LOG_FILE) return
  try {
    if (!logDirReady) logDirReady = mkdir(path.dirname(METRICS_LOG_FILE), { recursive: true })
    await logDirReady
    await appendFile(METRICS_LOG_FILE, JSON.stringify(record) + '\n', 'utf8')
  } catch (e) {
    console.warn('[metrics] log file write error:', e.message)
  }
}

/**
 * @param {{ transferId: string, mode: 'internet'|'lan', role: 'sender'|'receiver',
 *           outcome: string, summary: object }} payload
 */
export async function writeMetrics(payload) {
  const { transferId, mode, role, outcome, summary } = payload ?? {}
  if (!transferId || !mode || !role || !summary) return

  // ── Local JSONL log — written first, independent of InfluxDB ────────────
  const { id: _redundantId, ...summaryRest } = summary
  await logToFile({
    ...summaryRest,
    timestamp: new Date().toISOString(),
    transferId,
    mode,
    role,
    outcome: outcome || 'done',
  })

  // Skip InfluxDB if not configured
  if (!INFLUX_TOKEN || !WRITE_URL) return

  // ── Tags (single line, no newlines) ─────────────────────────────────────
  const tags = [
    `mode=${escapeTag(mode)}`,
    `role=${escapeTag(role)}`,
    `outcome=${escapeTag(outcome || 'done')}`,
    `transferId=${escapeTag(transferId)}`,   // useful as a tag for filtering
  ].join(',')

  // ── Derived numbers ─────────────────────────────────────────────────────
  const MB = 1024 * 1024
  const totalBytes           = Number(summary.totalBytes)           || 0
  const durationMs           = Number(summary.durationMs)           || 0
  const connectionMs         = Number(summary.connectionMs)         || 0
  const avgSpeedBps          = Number(summary.avgSpeedBps)          || 0
  const peakSpeedBps         = Number(summary.peakSpeedBps)         || 0
  const chunkCount           = Number(summary.chunkCount)           || 0
  const backpressurePauses   = Number(summary.backpressurePauses)   || 0
  const backpressureTotalMs  = Number(summary.backpressureTotalMs)  || 0
  const rttMs                = Number(summary.rttMs)                || 0
  const availableBitrate     = Number(summary.availableBitrate)     || 0
  const sctpBytesSent        = Number(summary.sctpBytesSent)        || 0

  const transferSizeMB       = totalBytes / MB
  const durationSec          = durationMs / 1000
  const avgSpeedMBps         = avgSpeedBps / MB
  const peakSpeedMBps        = peakSpeedBps / MB
  const avgSpeedMbps         = (avgSpeedBps * 8) / 1_000_000
  const peakSpeedMbps        = (peakSpeedBps * 8) / 1_000_000
  const avgChunkSize         = chunkCount ? totalBytes / chunkCount : 0
  const backpressurePercent  = durationMs ? (backpressureTotalMs / durationMs) * 100 : 0
  const avgPauseMs           = backpressurePauses ? backpressureTotalMs / backpressurePauses : 0
  const connectionRatio      = durationMs ? connectionMs / durationMs : 0
  const throughputEfficiency = availableBitrate ? avgSpeedBps / availableBitrate : null
  const effectiveSpeedBps    = durationMs ? totalBytes / (durationMs / 1000) : 0
  const success              = outcome === 'done' ? 1 : 0

  // Speed-sample statistics (omit if no samples)
  const samples = summary.speedSamples ?? []
  const minSpeedBps      = samples.length ? Math.min(...samples) : null
  const maxSpeedBps      = samples.length ? Math.max(...samples) : null
  const meanSpeedBps     = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null
  const sorted           = [...samples].sort((a, b) => a - b)
  const medianSpeedBps   = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
  const speedStdDev      = samples.length && meanSpeedBps != null
    ? Math.sqrt(samples.reduce((sum, x) => sum + (x - meanSpeedBps) ** 2, 0) / samples.length)
    : null
  const speed95Percentile = sorted.length
    ? sorted[Math.floor(sorted.length * 0.95)]
    : null

  // Health / congestion scores
  let healthScore = 100
  healthScore -= Math.min(rttMs / 5, 20)
  healthScore -= Math.min(backpressurePercent / 2, 40)
  healthScore -= Math.min(connectionRatio * 100, 20)
  healthScore = Math.max(healthScore, 0)

  const congestionScore =
    (backpressurePercent * 0.5) +
    (rttMs * 0.3) +
    (connectionRatio * 100 * 0.2)

  // ── Fields ──────────────────────────────────────────────────────────────
  const fields = [
    `totalBytes=${totalBytes}i`,
    `transferSizeMB=${transferSizeMB}`,
    `durationMs=${durationMs}i`,
    `durationSec=${durationSec}`,
    `connectionMs=${connectionMs}i`,
    `connectionRatio=${connectionRatio}`,
    `avgSpeedBps=${avgSpeedBps}`,
    `avgSpeedMBps=${avgSpeedMBps}`,
    `avgSpeedMbps=${avgSpeedMbps}`,
    `peakSpeedBps=${peakSpeedBps}`,
    `peakSpeedMBps=${peakSpeedMBps}`,
    `peakSpeedMbps=${peakSpeedMbps}`,
    numField('minSpeedBps', minSpeedBps),
    numField('maxSpeedBps', maxSpeedBps),
    numField('meanSpeedBps', meanSpeedBps),
    numField('medianSpeedBps', medianSpeedBps),
    numField('speedStdDev', speedStdDev),
    numField('speed95Percentile', speed95Percentile),
    `chunkCount=${chunkCount}i`,
    `avgChunkSize=${avgChunkSize}`,
    `backpressurePauses=${backpressurePauses}i`,
    `backpressureTotalMs=${backpressureTotalMs}i`,
    `backpressurePercent=${backpressurePercent}`,
    `avgPauseMs=${avgPauseMs}`,
    numField('rttMs', rttMs),
    numField('availableBitrate', availableBitrate),
    numField('throughputEfficiency', throughputEfficiency),   // omitted when null
    `sctpBytesSent=${sctpBytesSent}i`,
    `effectiveSpeedBps=${effectiveSpeedBps}`,
    `fileCount=${summary.files?.length || 0}i`,
    `success=${success}i`,
    `healthScore=${healthScore}`,
    `congestionScore=${congestionScore}`,
  ].filter(f => f != null).join(',')          // keep real zeros, drop only nulls

  const lines = [`transfer_summary,${tags} ${fields} ${Date.now()}`]

  // ── Per-file breakdown ──────────────────────────────────────────────────
  if (Array.isArray(summary.files)) {
    for (const [i, f] of summary.files.entries()) {
      const size        = Number(f.size)        || 0
      const durationMs  = Number(f.durationMs)  || 0
      const avgSpeedBps = Number(f.avgSpeedBps) || 0
      const sizeMB      = size / MB
      const durationSec = durationMs / 1000
      const avgSpeedMbps = (avgSpeedBps * 8) / 1_000_000
      const extension   = (f.name?.split('.').pop() || 'unknown').toLowerCase()
      const status      = f.status || 'done'

      const fTags = [
        `mode=${escapeTag(mode)}`,
        `role=${escapeTag(role)}`,
        `outcome=${escapeTag(outcome || 'done')}`,
        `extension=${escapeTag(extension)}`,
        `status=${escapeTag(status)}`,
        `transferId=${escapeTag(transferId)}`,
      ].join(',')

      const fFields = [
        `fileIndex=${i}i`,
        `size=${size}i`,
        `sizeMB=${sizeMB}`,
        `durationMs=${durationMs}i`,
        `durationSec=${durationSec}`,
        `avgSpeedBps=${avgSpeedBps}`,
        `avgSpeedMbps=${avgSpeedMbps}`,
      ].join(',')

      lines.push(`transfer_file,${fTags} ${fFields} ${Date.now()}`)
    }
  }

  // ── Write ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch(WRITE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: lines.join('\n'),
    })
    if (!res.ok) {
      console.warn(`[metrics] InfluxDB write failed: ${res.status}`, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.warn('[metrics] InfluxDB write error:', e.message)
  }
}