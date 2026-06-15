import { useState } from 'react'

/**
 * @param {{ link: string, onCopy: () => Promise<boolean> }} props
 */
export default function ShareLinkBox({ link, onCopy }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleCopy = async () => {
    const ok = await onCopy()
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setFailed(true)
      setTimeout(() => setFailed(false), 2000)
    }
  }

  return (
    <div className="card p-5 animate-slide-up space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-status-connecting animate-pulse-dot" />
        <p className="text-sm font-medium text-ink">Share this link with the receiver</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={link}
          className="input-field flex-1 text-brand-400 select-all"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={handleCopy}
          className={
            copied
              ? 'btn-success flex-shrink-0'
              : failed
              ? 'btn-secondary flex-shrink-0 text-status-error border-status-error/30'
              : 'btn-secondary flex-shrink-0'
          }
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : failed ? (
            'Failed'
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        The receiver must open this link to start the transfer.
      </p>
    </div>
  )
}