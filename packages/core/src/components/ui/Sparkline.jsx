import React from 'react'

/**
 * Tiny SVG sparkline — no library, no deps, ~30 lines.
 * Renders a smooth path from an array of numbers.
 *
 * @param {{ data: number[], color?: string, width?: number, height?: number }} props
 */
export default function Sparkline({ data = [], color = '#00aee6', width = 80, height = 28 }) {
  if (data.length < 2) {
    return <svg width={width} height={height} />
  }

  const max  = Math.max(...data, 1)
  const step = width / (data.length - 1)

  const points = data.map((v, i) => [
    i * step,
    height - (v / max) * (height - 2) - 1,
  ])

  // Smooth bezier path
  const d = points.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x},${y}`
    const [px, py] = points[i - 1]
    const cx = (px + x) / 2
    return `${acc} C ${cx},${py} ${cx},${y} ${x},${y}`
  }, '')

  // Gradient fill beneath the line
  const fillId = `spark-fill-${color.replace('#', '')}`
  const areaD  = `${d} L ${points[points.length - 1][0]},${height} L 0,${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${fillId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}