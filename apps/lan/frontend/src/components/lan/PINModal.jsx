import React, { useState, useRef, useEffect } from 'react'

/**
 * Modal that appears when a receiver tries to join a PIN-protected session.
 * PIN is hashed client-side before being sent — server only sees the hash.
 */
export default function PINModal({ sessionLabel, onSubmit, onCancel, error }) {
  const [pin, setPin] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (pin.trim().length < 4) return
    onSubmit(pin.trim())
    setPin('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative card p-6 w-full max-w-sm space-y-5 animate-slide-up">
        {/* Icon */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-heading font-bold text-ink text-base">PIN required</h2>
            <p className="text-xs text-ink-muted mt-0.5 truncate max-w-[200px]">{sessionLabel}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider">
              Enter PIN
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="input-field w-full text-center text-xl tracking-[0.5em]"
            />
            {error && (
              <p className="text-xs text-status-error">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={pin.length < 4}
              className="btn-primary flex-1">Join</button>
          </div>
        </form>
      </div>
    </div>
  )
}