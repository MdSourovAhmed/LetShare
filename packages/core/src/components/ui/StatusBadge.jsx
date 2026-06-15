import React from 'react'
import clsx from 'clsx'

const dotColors = {
  idle:       'bg-status-idle',
  connecting: 'bg-status-connecting animate-pulse-dot',
  connected:  'bg-status-connected',
  error:      'bg-status-error',
}

const textColors = {
  idle:       'text-ink-muted',
  connecting: 'text-status-connecting',
  connected:  'text-status-connected',
  error:      'text-status-error',
}

/**
 * @param {{ type: 'idle'|'connecting'|'connected'|'error', label: string }} props
 */
export default function StatusBadge({ type = 'idle', label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('status-dot', dotColors[type] ?? dotColors.idle)} />
      <span className={clsx('text-sm font-medium', textColors[type] ?? textColors.idle)}>
        {label}
      </span>
    </div>
  )
}