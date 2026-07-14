// /**
//  * metricsWriter.js — Node.js (backend) InfluxDB line-protocol writer
//  *
//  * Receives the batched JSON payload from metricsBeacon (browser sendBeacon),
//  * converts each sample to InfluxDB line protocol, and POSTs it to InfluxDB
//  * via a single HTTP call.
//  *
//  * Why line protocol over the InfluxDB client library?
//  * The official @influxdata/influxdb-client adds 120 KB and ships its own
//  * HTTP layer. Line protocol is a plain text format — we just use fetch(),
//  * which is built into Node 18+. No extra dependency.
//  *
//  * Line protocol format (one line per sample):
//  *   <measurement>,tag1=v1,tag2=v2 field1=v1,field2=v2 <timestamp_ns>
//  *
//  * Example:
//  *   transfer,mode=lan,role=sender,transferId=abc123 \
//  *     speedBps=50000000,bytesSent=100000000,pauses=0i,chunks=1562i \
//  *     1720000000000000000
//  */

// const INFLUX_URL    = process.env.INFLUX_URL    || 'http://influxdb:8086'
// const INFLUX_TOKEN  = process.env.INFLUX_TOKEN  || ''
// const INFLUX_ORG    = process.env.INFLUX_ORG    || 'letshare'
// const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'transfers'

// const WRITE_URL = `${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=ms`

// /**
//  * Write a batch of samples to InfluxDB.
//  * Called from the /api/metrics Express handler.
//  *
//  * @param {{
//  *   transferId:  string,
//  *   mode:        'internet'|'lan',
//  *   role:        'sender'|'receiver',
//  *   outcome:     'progress'|'done'|'cancelled'|'error',
//  *   totalBytes:  number,
//  *   startedAt:   number,     // ms epoch
//  *   samples:     Array<{ts, bytesSent, speedBps, backpressurePauses, chunkCount}>
//  * }} payload
//  */
// export async function writeMetrics(payload) {
//   if (!INFLUX_TOKEN) return   // InfluxDB not configured — silently skip

//   const { transferId, mode, role, outcome, samples = [] } = payload

//   if (!samples.length && outcome === 'progress') return

//   // Build line-protocol lines — one per sample
//   const lines = samples.map((s) => {
//     const tags   = `mode=${escape(mode)},role=${escape(role)},transferId=${escape(transferId)}`
//     const fields = [
//       `speedBps=${s.speedBps}`,
//       `bytesSent=${s.bytesSent}`,
//       `backpressurePauses=${s.backpressurePauses}i`,
//       `chunkCount=${s.chunkCount}i`,
//     ].join(',')
//     return `transfer,${tags} ${fields} ${s.ts}`
//   })

//   // Also write a summary line if this is the final flush
//   if (outcome !== 'progress') {
//     const tags   = `mode=${escape(mode)},role=${escape(role)},transferId=${escape(transferId)},outcome=${escape(outcome)}`
//     const fields = `totalBytes=${payload.totalBytes},durationMs=${Date.now() - (payload.startedAt || Date.now())}`
//     lines.push(`transfer_summary,${tags} ${fields} ${Date.now()}`)
//   }

//   const body = lines.join('\n')

//   try {
//     const res = await fetch(WRITE_URL, {
//       method:  'POST',
//       headers: {
//         'Authorization': `Token ${INFLUX_TOKEN}`,
//         'Content-Type':  'text/plain; charset=utf-8',
//       },
//       body,
//     })
//     if (!res.ok) {
//       console.warn(`[metrics] InfluxDB write failed: ${res.status} ${await res.text()}`)
//     }
//   } catch (e) {
//     // Never let a metrics write failure bubble up to affect the signaling server
//     console.warn('[metrics] InfluxDB write error:', e.message)
//   }
// }

// function escape(str) {
//   return String(str).replace(/[, =]/g, '\\$&')
// }



// t > /mnt/user-data/outputs/letshare3/packages/core/src/lib/metricsWriter.js << 'EOF'
/**
 * metricsWriter.js — Node.js InfluxDB line-protocol writer
 *
 * Fix: replaced the deprecated globalThis.escape() (which was shadowing
 * our local escape function in unpredictable ways under ESM) with an
 * explicitly named escapeTag() function used throughout.
 */

const INFLUX_URL    = process.env.INFLUX_URL    || 'http://localhost:8086'
const INFLUX_TOKEN  = process.env.INFLUX_TOKEN  || 'sas'
const INFLUX_ORG    = process.env.INFLUX_ORG    || 'letshare'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'transfers'

const WRITE_URL = `${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=ms`

/** Escape special chars in InfluxDB line-protocol tag values */
function escapeTag(str) {
  return String(str ?? '').replace(/[, =\\]/g, '\\$&')
}

export async function writeMetrics(payload) {
  console.log(payload);
  if (!INFLUX_TOKEN) return

  const { transferId, mode, role, outcome, samples = [] } = payload ?? {}
  if (!transferId || !mode || !role) return
  if (!samples.length && outcome === 'progress') return

  const lines = samples.map((s) => {
    const tags   = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)}`
    const fields = [
      `speedBps=${Number(s.speedBps)  || 0}`,
      `bytesSent=${Number(s.bytesSent) || 0}`,
      `backpressurePauses=${Number(s.backpressurePauses) || 0}i`,
      `chunkCount=${Number(s.chunkCount) || 0}i`,
    ].join(',')
    return `transfer,${tags} ${fields} ${s.ts}`
  })

  if (outcome && outcome !== 'progress') {
    const tags   = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)},outcome=${escapeTag(outcome)}`
    const tBytes = Number(payload.totalBytes) || 0
    const tMs    = payload.startedAt ? Date.now() - Number(payload.startedAt) : 0
    lines.push(`transfer_summary,${tags} totalBytes=${tBytes},durationMs=${tMs} ${Date.now()}`)
  }

  if (!lines.length) return
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






// /**
//  * metricsWriter.js — Node.js InfluxDB line-protocol writer
//  *
//  * Fix: replaced the deprecated globalThis.escape() (which was shadowing
//  * our local escape function in unpredictable ways under ESM) with an
//  * explicitly named escapeTag() function used throughout.
//  */

// const INFLUX_URL    = process.env.INFLUX_URL    || 'http://influxdb:8086'
// const INFLUX_TOKEN  = process.env.INFLUX_TOKEN  || ''
// const INFLUX_ORG    = process.env.INFLUX_ORG    || 'letshare'
// const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'transfers'

// const WRITE_URL = `${INFLUX_URL}/api/v2/write?org=${INFLUX_ORG}&bucket=${INFLUX_BUCKET}&precision=ms`

// /** Escape special chars in InfluxDB line-protocol tag values */
// function escapeTag(str) {
//   return String(str ?? '').replace(/[, =\\]/g, '\\$&')
// }

// export async function writeMetrics(payload) {
//   if (!INFLUX_TOKEN) return

//   const { transferId, mode, role, outcome, samples = [] } = payload ?? {}
//   if (!transferId || !mode || !role) return
//   if (!samples.length && outcome === 'progress') return

//   const lines = samples.map((s) => {
//     const tags   = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)}`
//     const fields = [
//       `speedBps=${Number(s.speedBps)  || 0}`,
//       `bytesSent=${Number(s.bytesSent) || 0}`,
//       `backpressurePauses=${Number(s.backpressurePauses) || 0}i`,
//       `chunkCount=${Number(s.chunkCount) || 0}i`,
//     ].join(',')
//     return `transfer,${tags} ${fields} ${s.ts}`
//   })

//   if (outcome && outcome !== 'progress') {
//     const tags   = `mode=${escapeTag(mode)},role=${escapeTag(role)},transferId=${escapeTag(transferId)},outcome=${escapeTag(outcome)}`
//     const tBytes = Number(payload.totalBytes) || 0
//     const tMs    = payload.startedAt ? Date.now() - Number(payload.startedAt) : 0
//     lines.push(`transfer_summary,${tags} totalBytes=${tBytes},durationMs=${tMs} ${Date.now()}`)
//   }

//   if (!lines.length) return
//   const body = lines.join('\n')

//   try {
//     const res = await fetch(WRITE_URL, {
//       method:  'POST',
//       headers: { 'Authorization': `Token ${INFLUX_TOKEN}`, 'Content-Type': 'text/plain; charset=utf-8' },
//       body,
//     })
//     if (!res.ok) console.warn(`[metrics] InfluxDB write failed: ${res.status}`, await res.text().catch(() => ''))
//   } catch (e) {
//     console.warn('[metrics] InfluxDB write error:', e.message)
//   }
// }