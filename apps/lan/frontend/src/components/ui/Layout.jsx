


import React from 'react'
import { NavLink } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-border bg-surface-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
              LS
            </span>
            <span className="font-heading font-bold text-ink text-base tracking-tight">
              Lets<span className="text-brand-400">Share</span>
              <span className="ml-2 text-[10px] font-mono text-status-connected border border-status-connected/30 rounded px-1.5 py-0.5 align-middle">
                LAN
              </span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            <NavLink to="/"
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-400'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                }`}>
              Lobby
            </NavLink>
          </nav>

          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <span className="w-1.5 h-1.5 rounded-full bg-status-connected animate-pulse-dot" />
            letshare.local
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">{children}</main>

      <footer className="border-t border-surface-border py-4 text-center text-xs text-ink-faint">
        LAN only — files never leave your network.
      </footer>
    </div>
  )
}