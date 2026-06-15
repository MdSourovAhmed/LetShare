import React from 'react'

/**
 * SVG circular progress ring — no deps.
 * @param {{ value: number, size?: number, stroke?: number, color?: string, label?: string }} props
 */
export default function RadialProgress({
  value   = 0,
  size    = 56,
  stroke  = 4,
  color   = '#00aee6',
  label,
}) {
  const r          = (size - stroke) / 2
  const circ       = 2 * Math.PI * r
  const pct        = Math.min(100, Math.max(0, value))
  const dashOffset = circ - (pct / 100) * circ
  const done       = pct === 100
  const ringColor  = done ? '#22c55e' : color

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#1e2d3d" strokeWidth={stroke} />
        {/* Fill */}
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-mono font-semibold text-ink">
          {label ?? `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  )
}