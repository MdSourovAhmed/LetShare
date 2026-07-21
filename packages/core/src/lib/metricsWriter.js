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

const INFLUX_URL      = process.env.INFLUX_URL    || 'http://localhost:8086'
const INFLUX_TOKEN    = process.env.INFLUX_TOKEN  || ''
const INFLUX_ORG      = process.env.INFLUX_ORG    || 'letshare'
const INFLUX_BUCKET   = process.env.INFLUX_BUCKET || 'transfers'
const METRICS_LOG_FILE = process.env.METRICS_LOG_FILE || null

const WRITE_URL = `${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=ms`

let logDirReady = null   // memoised mkdir promise — only need to do this once

/** Escape special chars in InfluxDB line-protocol tag values */
function escapeTag(str) {
  return String(str ?? '').replace(/[, =\\]/g, '\\$&')
}

/** Numeric field — omitted entirely from the line if null/undefined, so
 *  missing WebRTC stats (e.g. getStats() not supported) don't write 0 and
 *  skew averages in Grafana. */
function numField(name, value, integer = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null
  return `${name}=${Number(value)}${integer ? 'i' : ''}`
}

/** Append one JSON line for this transfer. Never throws — logging failures
 *  are a warning, not a reason to drop the transfer's InfluxDB write too. */
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
  // summary (the record built by telemetryTracker.js) already carries its
  // own mode/role/outcome/timestamp/id — spread first, then override with
  // the canonical values from the beacon payload so there's no ambiguity
  // about which one wins, and drop summary's redundant `id` in favour of
  // the real transferId.
  const { id: _redundantId, ...summaryRest } = summary
  await logToFile({
    ...summaryRest,
    timestamp: new Date().toISOString(),
    transferId, mode, role, outcome: outcome || 'done',
  })

  if (!INFLUX_TOKEN) return

  const tags = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)},outcome=${escapeTag(outcome || 'done')}`

  const fields = [
    `totalBytes=${Number(summary.totalBytes) || 0}i`,
    `durationMs=${Number(summary.durationMs) || 0}i`,
    numField('connectionMs',        summary.connectionMs,        true),
    numField('avgSpeedBps',         summary.avgSpeedBps),
    numField('peakSpeedBps',        summary.peakSpeedBps),
    numField('chunkCount',          summary.chunkCount,          true),
    numField('backpressurePauses',  summary.backpressurePauses,  true),
    numField('backpressureTotalMs', summary.backpressureTotalMs, true),
    numField('rttMs',               summary.rttMs),
    numField('availableBitrate',    summary.availableBitrate),
    numField('sctpBytesSent',       summary.sctpBytesSent,       true),
    numField('fileCount',           summary.files?.length,       true),
  ].filter(Boolean).join(',')

  const lines = [`transfer_summary,${tags} ${fields} ${Date.now()}`]

  // ── Per-file breakdown — one line per file ──────────────────────────────
  // Lets Grafana answer "which files/sizes are slow" per mode, not just
  // "how was the transfer overall". fileStatus is a tag (low cardinality:
  // done/error/skipped) so it's cheaply groupable/filterable.
  if (Array.isArray(summary.files)) {
    summary.files.forEach((f, i) => {
      const fTags = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)},fileStatus=${escapeTag(f.status || 'done')}`
      const fFields = [
        `fileIndex=${i}i`,
        `size=${Number(f.size) || 0}i`,
        `durationMs=${Number(f.durationMs) || 0}i`,
        `avgSpeedBps=${Number(f.avgSpeedBps) || 0}`,
      ].join(',')
      lines.push(`transfer_file,${fTags} ${fFields} ${Date.now()}`)
    })
  }

  const body = lines.join('\n')

  try {
    const res = await fetch(WRITE_URL, {
      method:  'POST',
      headers: { 'Authorization': `Token ${INFLUX_TOKEN}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    })
    if (!res.ok) console.warn(`[metrics] InfluxDB write failed: ${res.status}`, await res.text().catch(() => ''))
  } catch (e) {
    console.warn('[metrics] InfluxDB write error:', e.message)
  }
}
