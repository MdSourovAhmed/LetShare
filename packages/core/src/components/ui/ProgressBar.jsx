import React from 'react'
import clsx from 'clsx'

/**
 * @param {{ value: number, variant?: 'brand'|'success', size?: 'sm'|'md', className?: string }} props
 */
export default function ProgressBar({ value = 0, variant = 'brand', size = 'md', className }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5'
  const fill = variant === 'success'
    ? 'bg-gradient-to-r from-green-600 to-green-400'
    : 'bg-gradient-to-r from-brand-600 to-brand-400'

  return (
    <div className={clsx('progress-track w-full', h, className)}>
      <div
        className={clsx(fill, 'h-full rounded-full transition-all duration-300')}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}