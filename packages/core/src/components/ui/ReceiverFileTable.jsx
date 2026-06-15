import React from 'react'
import { formatBytes } from '../../lib/utils'
import ProgressBar from './ProgressBar'

/**
 * Shows path (folder/file.txt) instead of just name, with download button per file.
 */
export default function ReceiverFileTable({ rows }) {
  if (!rows.length) return null

  const handleDownload = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="card overflow-hidden animate-slide-up">
      <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
        <span className="font-heading font-semibold text-sm text-ink">Incoming Files</span>
        <span className="text-xs text-ink-muted">{rows.length} file{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-muted/50">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider">Path</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-24">Size</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-40">Progress</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider w-28">Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((row, i) => {
              const isDone = row.progress === 100 && row.url
              return (
                <tr key={i} className="hover:bg-surface-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      <span className="text-ink text-xs truncate max-w-[200px] font-mono" title={row.path}>
                        {row.path}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-ink-muted text-xs">{formatBytes(row.size)}</td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-1">
                      <ProgressBar value={row.progress} variant={isDone ? 'success' : 'brand'} size="sm" />
                      <span className="text-xs text-ink-faint font-mono">{row.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {isDone ? (
                      <button
                        onClick={() => handleDownload(row.url, row.name)}
                        className="btn-success text-xs px-3 py-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Save
                      </button>
                    ) : (
                      <span className="text-xs text-ink-faint italic">Waiting…</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}