// import { NavLink } from 'react-router-dom'

// export default function Layout({ children }) {
//   return (
//     <div className="min-h-screen flex flex-col">
//       {/* ── Top nav ── */}
//       <header className="border-b border-surface-border bg-surface-card/80 backdrop-blur-md sticky top-0 z-50">
//         <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
//           Logo
//           <NavLink to="/" className="flex items-center gap-2.5 group">
//             <span className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-xs font-heading font-bold">
//               P2
//             </span>
//             <span className="font-heading font-bold text-ink text-base tracking-tight">
//               P2P
//               <span className="text-brand-400">Share</span>
//             </span>
//           </NavLink>

//           <NavLink to="/" className="flex items-center gap-2.5 group" aria-label="P2P Share home">
//   <span className="font-heading font-bold text-ink text-base tracking-tight">
//     P2P
//     <span className="text-brand-400">Share</span>
//   </span>
// </NavLink>

//           {/* Nav links */}
//           <nav className="flex items-center gap-1">
//             <NavLink
//               to="/send"
//               className={({ isActive }) =>
//                 `px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
//                 ${isActive
//                   ? 'bg-brand-500/15 text-brand-400'
//                   : 'text-ink-muted hover:text-ink hover:bg-surface-muted'}`
//               }
//             >
//               Send
//             </NavLink>
//             <NavLink
//               to="/receive"
//               className={({ isActive }) =>
//                 `px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
//                 ${isActive
//                   ? 'bg-brand-500/15 text-brand-400'
//                   : 'text-ink-muted hover:text-ink hover:bg-surface-muted'}`
//               }
//             >
//               Receive
//             </NavLink>
//           </nav>
//         </div>
//       </header>

//       {/* ── Page content ── */}
//       <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
//         {children}
//       </main>

//       {/* ── Footer ── */}
//       <footer className="border-t border-surface-border py-5 text-center text-xs text-ink-faint">
//         Files are transferred directly between devices via WebRTC — nothing touches a server.
//       </footer>
//     </div>
//   )
// }



import { NavLink } from 'react-router-dom';

export default function Layout({ children }) {
  // Helper for cleaner NavLink logic
  const navLinkClass = ({ isActive }) =>
    `px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-brand-500/15 text-brand-400'
        : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top nav ── */}
      <header className="border-b border-surface-border bg-surface-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          
          {/* Logo - Unified into one link */}
          <NavLink to="/" end className="flex items-center gap-2.5 group">
            <span className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-xs font-heading font-bold">
              P2
            </span>
            <span className="font-heading font-bold text-ink text-base tracking-tight">
              P2P
              <span className="text-brand-400">Share</span>
            </span>
          </NavLink>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <NavLink to="/send" className={navLinkClass}>
              Send
            </NavLink>
            <NavLink to="/receive" className={navLinkClass}>
              Receive
            </NavLink>
          </nav>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-surface-border py-5 text-center text-xs text-ink-faint">
        Files are transferred directly between devices via WebRTC — nothing touches a server.
      </footer>
    </div>
  );
}
