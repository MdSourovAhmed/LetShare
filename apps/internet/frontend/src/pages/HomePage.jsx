import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl mx-auto text-center space-y-10 animate-slide-up">
      <div className="space-y-4 pt-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
          No cloud. No account. Just WebRTC.
        </div>
        <h1 className="font-heading font-bold text-5xl text-ink leading-tight tracking-tight">
          Share files<br /><span className="text-brand-400">anywhere</span>
        </h1>
        <p className="text-ink-muted text-lg max-w-md mx-auto">
          Generate a link, share it, files stream directly browser-to-browser. Nothing stored on any server.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
        {[
          {
            to: '/send', label: 'Send Files',
            desc: 'Pick files or a folder, get a share link, send to anyone worldwide.',
            cta: 'Start sending',
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>,
          },
          {
            to: '/receive', label: 'Receive Files',
            desc: 'Open a share link — files arrive directly in your browser.',
            cta: 'Open a link',
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
          },
        ].map(({ to, label, desc, cta, icon }) => (
          <button key={to} onClick={() => navigate(to)}
            className="card p-6 text-left group hover:border-brand-500/40 hover:bg-surface-muted/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
            </div>
            <h2 className="font-heading font-semibold text-lg text-ink mb-1">{label}</h2>
            <p className="text-sm text-ink-muted leading-relaxed">{desc}</p>
            <span className="inline-flex items-center gap-1 text-brand-400 text-sm font-medium mt-4 group-hover:gap-2 transition-all">
              {cta}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </span>
          </button>
        ))}
      </div>

      <div className="card p-6 text-left space-y-4">
        <h3 className="font-heading font-semibold text-sm text-ink-muted uppercase tracking-wider">How it works</h3>
        <ol className="space-y-3">
          {[
            ['Select files', 'Pick any files or a folder on the Send page.'],
            ['Create a link', 'A unique share link is generated for your session.'],
            ['Share the link', 'Send it via chat, email, or any messaging app.'],
            ['Direct transfer', 'Files stream directly browser-to-browser via WebRTC.'],
          ].map(([title, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500/15 text-brand-400 font-mono text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
              <div>
                <span className="text-sm font-medium text-ink">{title} — </span>
                <span className="text-sm text-ink-muted">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}