import React from 'react'
import clsx from 'clsx'

/**
 * A small labelled stat chip used in stats panels.
 * @param {{ label: string, value: string, accent?: boolean }} props
 */
export default function StatPill({ label, value, accent = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-faint font-medium">{label}</span>
      <span className={clsx('text-sm font-mono font-semibold',
        accent ? 'text-brand-400' : 'text-ink')}>{value}</span>
    </div>
  )
}