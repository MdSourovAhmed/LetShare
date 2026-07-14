import React from 'react'
import { formatBytes, formatSpeed, formatDuration } from '../../../lib/utils'

/**
 * Pure SVG chart components — no chart library, no deps beyond React.
 *
 * Why pure SVG:
 * A charting library (recharts, chart.js) adds 40–80 KB to the bundle and
 * pulls in its own animation loop. These charts are small, purposeful, and
 * render identically across browsers with zero overhead.
 */

// ── Shared SVG helpers ────────────────────────────────────────────────────────

function svgPath(points, w, h, padX = 0, padY = 4) {
  if (points.length < 2) return ''
  const max  = Math.max(...points, 1)
  const min  = Math.min(...points, 0)
  const range = max - min || 1
  const step  = (w - padX * 2) / (points.length - 1)
  const coords = points.map((v, i) => [
    padX + i * step,
    h - padY - ((v - min) / range) * (h - padY * 2),
  ])
  const d = coords.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = coords[i - 1]
    const cx = (px + x) / 2
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')
  const area = `${d} L${coords[coords.length - 1][0]},${h} L${coords[0][0]},${h} Z`
  return { d, area, coords, max, min }
}

// ── Throughput line chart ─────────────────────────────────────────────────────

export function ThroughputChart({ records, width = 480, height = 120 }) {
  if (!records.length) return null

  const colors = { internet: '#00aee6', lan: '#22c55e' }

  // Normalise all series to the same length by resampling to 20 points
  const resample = (arr, n = 20) => {
    if (!arr?.length) return Array(n).fill(0)
    const step = arr.length / n
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)] ?? 0)
  }

  const series = records.map((r) => ({
    id:      r.id,
    mode:    r.mode,
    role:    r.role,
    label:   `${r.mode.toUpperCase()} · ${r.role} · ${new Date(r.timestamp).toLocaleTimeString()}`,
    color:   colors[r.mode] ?? '#8b949e',
    samples: resample(r.speedSamples),
  }))

  const allValues = series.flatMap((s) => s.samples)
  const globalMax = Math.max(...allValues, 1)

  const padX = 8
  const padY = 8

  return (
    <div className="space-y-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        className="w-full" style={{ maxWidth: width }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0"    />
            </linearGradient>
          ))}
        </defs>

        {/* Y-axis grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padY + (1 - frac) * (height - padY * 2)
          return (
            <g key={frac}>
              <line x1={padX} x2={width - padX} y1={y} y2={y}
                stroke="#1e2d3d" strokeWidth="1" />
              <text x={padX + 2} y={y - 3} fill="#3d4f61"
                fontSize="9" fontFamily="JetBrains Mono, monospace">
                {formatSpeed(globalMax * frac)}
              </text>
            </g>
          )
        })}

        {/* Series */}
        {series.map((s) => {
          const step = (width - padX * 2) / (s.samples.length - 1)
          const pts  = s.samples.map((v, i) => [
            padX + i * step,
            padY + (1 - v / globalMax) * (height - padY * 2),
          ])
          const d    = pts.reduce((acc, [x, y], i) => {
            if (i === 0) return `M${x},${y}`
            const [px, py] = pts[i - 1]
            const cx = (px + x) / 2
            return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
          }, '')
          const area = `${d} L${pts[pts.length-1][0]},${height} L${pts[0][0]},${height} Z`
          return (
            <g key={s.id}>
              <path d={area} fill={`url(#grad-${s.id})`} />
              <path d={d} fill="none" stroke={s.color}
                strokeWidth="1.5" strokeLinecap="round" />
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {series.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full inline-block"
              style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-ink-muted font-mono">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bar chart (time-to-complete comparison) ───────────────────────────────────

export function DurationBarChart({ records, width = 480, height = 140 }) {
  if (!records.length) return null

  const colors = { internet: '#00aee6', lan: '#22c55e' }
  const maxMs  = Math.max(...records.map((r) => r.durationMs), 1)
  const barH   = Math.max(12, Math.floor((height - 20) / records.length) - 6)
  const labelW = 140
  const barW   = width - labelW - 40

  return (
    <svg width={width} height={records.length * (barH + 8) + 20}
      viewBox={`0 0 ${width} ${records.length * (barH + 8) + 20}`}
      className="w-full" style={{ maxWidth: width }}>

      {records.map((r, i) => {
        const y     = 10 + i * (barH + 8)
        const fill  = width * (r.durationMs / maxMs)
        const color = colors[r.mode] ?? '#8b949e'
        const label = `${r.mode.toUpperCase()} · ${r.role}`
        const value = formatDuration(r.durationMs / 1000)

        return (
          <g key={r.id}>
            {/* Label */}
            <text x={0} y={y + barH / 2 + 4} fill="#8b949e"
              fontSize="10" fontFamily="DM Sans, sans-serif">
              {label}
            </text>
            {/* Track */}
            <rect x={labelW} y={y} width={barW} height={barH}
              rx="4" fill="#1a2636" />
            {/* Fill */}
            <rect x={labelW} y={y} width={(barW * r.durationMs) / maxMs} height={barH}
              rx="4" fill={color} fillOpacity="0.8" />
            {/* Value */}
            <text x={labelW + (barW * r.durationMs) / maxMs + 6}
              y={y + barH / 2 + 4} fill={color}
              fontSize="10" fontFamily="JetBrains Mono, monospace">
              {value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Scatter plot (speed vs file size) ────────────────────────────────────────

export function SpeedScatterPlot({ records, width = 480, height = 160 }) {
  if (!records.length) return null

  const colors  = { internet: '#00aee6', lan: '#22c55e' }
  const maxSize = Math.max(...records.map((r) => r.totalBytes), 1)
  const maxSpd  = Math.max(...records.map((r) => r.avgSpeedBps), 1)
  const padX = 56, padY = 16
  const plotW = width - padX - 16
  const plotH = height - padY - 24

  return (
    <svg width={width} height={height}
      viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }}>

      {/* Axes */}
      <line x1={padX} x2={padX + plotW} y1={padY + plotH} y2={padY + plotH}
        stroke="#1e2d3d" strokeWidth="1" />
      <line x1={padX} x2={padX} y1={padY} y2={padY + plotH}
        stroke="#1e2d3d" strokeWidth="1" />

      {/* Y ticks */}
      {[0, 0.5, 1].map((f) => {
        const y = padY + plotH - f * plotH
        return (
          <g key={f}>
            <line x1={padX - 3} x2={padX} y1={y} y2={y} stroke="#1e2d3d" strokeWidth="1" />
            <text x={padX - 5} y={y + 4} fill="#3d4f61" fontSize="9"
              textAnchor="end" fontFamily="JetBrains Mono, monospace">
              {formatSpeed(maxSpd * f)}
            </text>
          </g>
        )
      })}

      {/* X ticks */}
      {[0, 0.5, 1].map((f) => {
        const x = padX + f * plotW
        return (
          <g key={f}>
            <line x1={x} x2={x} y1={padY + plotH} y2={padY + plotH + 3}
              stroke="#1e2d3d" strokeWidth="1" />
            <text x={x} y={padY + plotH + 13} fill="#3d4f61" fontSize="9"
              textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {formatBytes(maxSize * f)}
            </text>
          </g>
        )
      })}

      {/* Points */}
      {records.map((r) => {
        const cx = padX + (r.totalBytes / maxSize) * plotW
        const cy = padY + plotH - (r.avgSpeedBps / maxSpd) * plotH
        const color = colors[r.mode] ?? '#8b949e'
        return (
          <g key={r.id}>
            <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity="0.8" />
            <circle cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth="1" />
          </g>
        )
      })}

      {/* Axis labels */}
      <text x={padX + plotW / 2} y={height - 2} fill="#3d4f61" fontSize="9"
        textAnchor="middle" fontFamily="DM Sans, sans-serif">
        Transfer size
      </text>
      <text x={10} y={padY + plotH / 2} fill="#3d4f61" fontSize="9"
        textAnchor="middle" fontFamily="DM Sans, sans-serif"
        transform={`rotate(-90, 10, ${padY + plotH / 2})`}>
        Avg speed
      </text>
    </svg>
  )
}

// ── Backpressure pause bar ────────────────────────────────────────────────────

export function BackpressureChart({ records, width = 480, height = 80 }) {
  if (!records.length) return null

  const colors   = { internet: '#f59e0b', lan: '#a855f7' }
  const maxPause = Math.max(...records.map((r) => r.backpressureTotalMs), 1)
  const barH     = Math.max(10, Math.floor((height - 16) / records.length) - 5)
  const labelW   = 140
  const barW     = width - labelW - 60

  return (
    <svg width={width} height={records.length * (barH + 8) + 16}
      viewBox={`0 0 ${width} ${records.length * (barH + 8) + 16}`}
      className="w-full" style={{ maxWidth: width }}>
      {records.map((r, i) => {
        const y     = 8 + i * (barH + 8)
        const color = colors[r.mode] ?? '#8b949e'
        const pct   = r.backpressureTotalMs / maxPause
        return (
          <g key={r.id}>
            <text x={0} y={y + barH / 2 + 4} fill="#8b949e"
              fontSize="10" fontFamily="DM Sans, sans-serif">
              {`${r.mode.toUpperCase()} · ${r.backpressurePauses} pauses`}
            </text>
            <rect x={labelW} y={y} width={barW} height={barH} rx="3" fill="#1a2636" />
            <rect x={labelW} y={y} width={barW * pct} height={barH} rx="3"
              fill={color} fillOpacity="0.75" />
            <text x={labelW + barW * pct + 5} y={y + barH / 2 + 4}
              fill={color} fontSize="10" fontFamily="JetBrains Mono, monospace">
              {`${Math.round(r.backpressureTotalMs)}ms`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}





// import React from 'react'
// import { formatBytes, formatSpeed, formatDuration } from '../../../lib/utils'

// /**
//  * Pure SVG chart components — no chart library, no deps beyond React.
//  *
//  * Why pure SVG:
//  * A charting library (recharts, chart.js) adds 40–80 KB to the bundle and
//  * pulls in its own animation loop. These charts are small, purposeful, and
//  * render identically across browsers with zero overhead.
//  */

// // ── Shared SVG helpers ────────────────────────────────────────────────────────

// function svgPath(points, w, h, padX = 0, padY = 4) {
//   if (points.length < 2) return ''
//   const max  = Math.max(...points, 1)
//   const min  = Math.min(...points, 0)
//   const range = max - min || 1
//   const step  = (w - padX * 2) / (points.length - 1)
//   const coords = points.map((v, i) => [
//     padX + i * step,
//     h - padY - ((v - min) / range) * (h - padY * 2),
//   ])
//   const d = coords.reduce((acc, [x, y], i) => {
//     if (i === 0) return `M${x},${y}`
//     const [px, py] = coords[i - 1]
//     const cx = (px + x) / 2
//     return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
//   }, '')
//   const area = `${d} L${coords[coords.length - 1][0]},${h} L${coords[0][0]},${h} Z`
//   return { d, area, coords, max, min }
// }

// // ── Throughput line chart ─────────────────────────────────────────────────────

// export function ThroughputChart({ records, width = 480, height = 120 }) {
//   if (!records.length) return null

//   const colors = { internet: '#00aee6', lan: '#22c55e' }

//   // Normalise all series to the same length by resampling to 20 points
//   const resample = (arr, n = 20) => {
//     if (!arr?.length) return Array(n).fill(0)
//     const step = arr.length / n
//     return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)] ?? 0)
//   }

//   const series = records.map((r) => ({
//     id:      r.id,
//     mode:    r.mode,
//     role:    r.role,
//     label:   `${r.mode.toUpperCase()} · ${r.role} · ${new Date(r.timestamp).toLocaleTimeString()}`,
//     color:   colors[r.mode] ?? '#8b949e',
//     samples: resample(r.speedSamples),
//   }))

//   const allValues = series.flatMap((s) => s.samples)
//   const globalMax = Math.max(...allValues, 1)

//   const padX = 8
//   const padY = 8

//   return (
//     <div className="space-y-2">
//       <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
//         className="w-full" style={{ maxWidth: width }}>
//         <defs>
//           {series.map((s) => (
//             <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
//               <stop offset="0%"   stopColor={s.color} stopOpacity="0.18" />
//               <stop offset="100%" stopColor={s.color} stopOpacity="0"    />
//             </linearGradient>
//           ))}
//         </defs>

//         {/* Y-axis grid lines */}
//         {[0.25, 0.5, 0.75, 1].map((frac) => {
//           const y = padY + (1 - frac) * (height - padY * 2)
//           return (
//             <g key={frac}>
//               <line x1={padX} x2={width - padX} y1={y} y2={y}
//                 stroke="#1e2d3d" strokeWidth="1" />
//               <text x={padX + 2} y={y - 3} fill="#3d4f61"
//                 fontSize="9" fontFamily="JetBrains Mono, monospace">
//                 {formatSpeed(globalMax * frac)}
//               </text>
//             </g>
//           )
//         })}

//         {/* Series */}
//         {series.map((s) => {
//           const step = (width - padX * 2) / (s.samples.length - 1)
//           const pts  = s.samples.map((v, i) => [
//             padX + i * step,
//             padY + (1 - v / globalMax) * (height - padY * 2),
//           ])
//           const d    = pts.reduce((acc, [x, y], i) => {
//             if (i === 0) return `M${x},${y}`
//             const [px, py] = pts[i - 1]
//             const cx = (px + x) / 2
//             return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
//           }, '')
//           const area = `${d} L${pts[pts.length-1][0]},${height} L${pts[0][0]},${height} Z`
//           return (
//             <g key={s.id}>
//               <path d={area} fill={`url(#grad-${s.id})`} />
//               <path d={d} fill="none" stroke={s.color}
//                 strokeWidth="1.5" strokeLinecap="round" />
//             </g>
//           )
//         })}
//       </svg>

//       {/* Legend */}
//       <div className="flex flex-wrap gap-3">
//         {series.map((s) => (
//           <div key={s.id} className="flex items-center gap-1.5">
//             <span className="w-3 h-0.5 rounded-full inline-block"
//               style={{ backgroundColor: s.color }} />
//             <span className="text-[10px] text-ink-muted font-mono">{s.label}</span>
//           </div>
//         ))}
//       </div>
//     </div>
//   )
// }

// // ── Bar chart (time-to-complete comparison) ───────────────────────────────────

// export function DurationBarChart({ records, width = 480, height = 140 }) {
//   if (!records.length) return null

//   const colors = { internet: '#00aee6', lan: '#22c55e' }
//   const maxMs  = Math.max(...records.map((r) => r.durationMs), 1)
//   const barH   = Math.max(12, Math.floor((height - 20) / records.length) - 6)
//   const labelW = 140
//   const barW   = width - labelW - 40

//   return (
//     <svg width={width} height={records.length * (barH + 8) + 20}
//       viewBox={`0 0 ${width} ${records.length * (barH + 8) + 20}`}
//       className="w-full" style={{ maxWidth: width }}>

//       {records.map((r, i) => {
//         const y     = 10 + i * (barH + 8)
//         const fill  = width * (r.durationMs / maxMs)
//         const color = colors[r.mode] ?? '#8b949e'
//         const label = `${r.mode.toUpperCase()} · ${r.role}`
//         const value = formatDuration(r.durationMs / 1000)

//         return (
//           <g key={r.id}>
//             {/* Label */}
//             <text x={0} y={y + barH / 2 + 4} fill="#8b949e"
//               fontSize="10" fontFamily="DM Sans, sans-serif">
//               {label}
//             </text>
//             {/* Track */}
//             <rect x={labelW} y={y} width={barW} height={barH}
//               rx="4" fill="#1a2636" />
//             {/* Fill */}
//             <rect x={labelW} y={y} width={(barW * r.durationMs) / maxMs} height={barH}
//               rx="4" fill={color} fillOpacity="0.8" />
//             {/* Value */}
//             <text x={labelW + (barW * r.durationMs) / maxMs + 6}
//               y={y + barH / 2 + 4} fill={color}
//               fontSize="10" fontFamily="JetBrains Mono, monospace">
//               {value}
//             </text>
//           </g>
//         )
//       })}
//     </svg>
//   )
// }

// // ── Scatter plot (speed vs file size) ────────────────────────────────────────

// export function SpeedScatterPlot({ records, width = 480, height = 160 }) {
//   if (!records.length) return null

//   const colors  = { internet: '#00aee6', lan: '#22c55e' }
//   const maxSize = Math.max(...records.map((r) => r.totalBytes), 1)
//   const maxSpd  = Math.max(...records.map((r) => r.avgSpeedBps), 1)
//   const padX = 56, padY = 16
//   const plotW = width - padX - 16
//   const plotH = height - padY - 24

//   return (
//     <svg width={width} height={height}
//       viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }}>

//       {/* Axes */}
//       <line x1={padX} x2={padX + plotW} y1={padY + plotH} y2={padY + plotH}
//         stroke="#1e2d3d" strokeWidth="1" />
//       <line x1={padX} x2={padX} y1={padY} y2={padY + plotH}
//         stroke="#1e2d3d" strokeWidth="1" />

//       {/* Y ticks */}
//       {[0, 0.5, 1].map((f) => {
//         const y = padY + plotH - f * plotH
//         return (
//           <g key={f}>
//             <line x1={padX - 3} x2={padX} y1={y} y2={y} stroke="#1e2d3d" strokeWidth="1" />
//             <text x={padX - 5} y={y + 4} fill="#3d4f61" fontSize="9"
//               textAnchor="end" fontFamily="JetBrains Mono, monospace">
//               {formatSpeed(maxSpd * f)}
//             </text>
//           </g>
//         )
//       })}

//       {/* X ticks */}
//       {[0, 0.5, 1].map((f) => {
//         const x = padX + f * plotW
//         return (
//           <g key={f}>
//             <line x1={x} x2={x} y1={padY + plotH} y2={padY + plotH + 3}
//               stroke="#1e2d3d" strokeWidth="1" />
//             <text x={x} y={padY + plotH + 13} fill="#3d4f61" fontSize="9"
//               textAnchor="middle" fontFamily="JetBrains Mono, monospace">
//               {formatBytes(maxSize * f)}
//             </text>
//           </g>
//         )
//       })}

//       {/* Points */}
//       {records.map((r) => {
//         const cx = padX + (r.totalBytes / maxSize) * plotW
//         const cy = padY + plotH - (r.avgSpeedBps / maxSpd) * plotH
//         const color = colors[r.mode] ?? '#8b949e'
//         return (
//           <g key={r.id}>
//             <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity="0.8" />
//             <circle cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth="1" />
//           </g>
//         )
//       })}

//       {/* Axis labels */}
//       <text x={padX + plotW / 2} y={height - 2} fill="#3d4f61" fontSize="9"
//         textAnchor="middle" fontFamily="DM Sans, sans-serif">
//         Transfer size
//       </text>
//       <text x={10} y={padY + plotH / 2} fill="#3d4f61" fontSize="9"
//         textAnchor="middle" fontFamily="DM Sans, sans-serif"
//         transform={`rotate(-90, 10, ${padY + plotH / 2})`}>
//         Avg speed
//       </text>
//     </svg>
//   )
// }

// // ── Backpressure pause bar ────────────────────────────────────────────────────

// export function BackpressureChart({ records, width = 480, height = 80 }) {
//   if (!records.length) return null

//   const colors   = { internet: '#f59e0b', lan: '#a855f7' }
//   const maxPause = Math.max(...records.map((r) => r.backpressureTotalMs), 1)
//   const barH     = Math.max(10, Math.floor((height - 16) / records.length) - 5)
//   const labelW   = 140
//   const barW     = width - labelW - 60

//   return (
//     <svg width={width} height={records.length * (barH + 8) + 16}
//       viewBox={`0 0 ${width} ${records.length * (barH + 8) + 16}`}
//       className="w-full" style={{ maxWidth: width }}>
//       {records.map((r, i) => {
//         const y     = 8 + i * (barH + 8)
//         const color = colors[r.mode] ?? '#8b949e'
//         const pct   = r.backpressureTotalMs / maxPause
//         return (
//           <g key={r.id}>
//             <text x={0} y={y + barH / 2 + 4} fill="#8b949e"
//               fontSize="10" fontFamily="DM Sans, sans-serif">
//               {`${r.mode.toUpperCase()} · ${r.backpressurePauses} pauses`}
//             </text>
//             <rect x={labelW} y={y} width={barW} height={barH} rx="3" fill="#1a2636" />
//             <rect x={labelW} y={y} width={barW * pct} height={barH} rx="3"
//               fill={color} fillOpacity="0.75" />
//             <text x={labelW + barW * pct + 5} y={y + barH / 2 + 4}
//               fill={color} fontSize="10" fontFamily="JetBrains Mono, monospace">
//               {`${Math.round(r.backpressureTotalMs)}ms`}
//             </text>
//           </g>
//         )
//       })}
//     </svg>
//   )
// }