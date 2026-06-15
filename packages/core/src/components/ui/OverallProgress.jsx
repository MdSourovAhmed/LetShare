import React from 'react'
import { formatBytes } from '../../lib/utils'
import ProgressBar from './ProgressBar'

/**
 * @param {{ totalSize: number, totalTransferred: number, label?: string }} props
 */
export default function OverallProgress({ totalSize, totalTransferred, label = 'Overall Progress' }) {
  const pct = totalSize > 0 ? Math.floor((totalTransferred / totalSize) * 100) : 0
  const done = pct === 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span className="font-medium">{label}</span>
        <span className="font-mono">
          {formatBytes(totalTransferred)} / {formatBytes(totalSize)}
          <span className="ml-2 text-ink-faint">({pct}%)</span>
        </span>
      </div>
      <ProgressBar value={pct} variant={done ? 'success' : 'brand'} />
    </div>
  )
}