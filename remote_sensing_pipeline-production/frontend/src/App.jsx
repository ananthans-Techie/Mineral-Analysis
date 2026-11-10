import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { Activity, History as HistoryIcon, LogOut, Map } from 'lucide-react'
import { DEMO, DEMO_NOTE } from './api'
import { AuthProvider, useAuth } from './auth'
import AuthPage from './pages/AuthPage'
import History from './pages/History'
import System from './pages/System'
import Workspace from './pages/Workspace'

// Static hosting (the demo Space) cannot serve index.html for deep links: use #/ routes there.
const Router = DEMO ? HashRouter : BrowserRouter

function RequireAuth({ children }) {
  const { signedIn, ready, isPublic } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="page muted">Loading…</div>
  if (isPublic) return children
  return signedIn ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />
}

function Shell({ children }) {
  const { user, logout, isPublic } = useAuth()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    try { localStorage.removeItem('hydranet.theme') } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const titles = {
      '/': 'Mineral Studio — Mineral Analysis Platform',
      '/jobs': 'Mineral Jobs — Mineral Analysis Platform',
      '/system': 'Platform Status — Mineral Analysis Platform',
    }
    document.title = titles[location.pathname] || (location.pathname.startsWith('/jobs/') ? 'Mineral Job — Mineral Analysis Platform' : 'Mineral Analysis Platform')
  }, [location.pathname])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" title="Mineral Analysis Platform">
          <img
            src="/assets/mineral-analysis-logo.png"
            alt="Mineral Analysis Platform Logo"
            className="brand-logo"
          />
          <span className="brand-name sr-only">Mineral Analysis Platform</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end><Map size={14} /> <span className="label">Mineral Studio</span></NavLink>
          <NavLink to="/jobs"><HistoryIcon size={14} /> <span className="label">Mineral Jobs</span></NavLink>
          <NavLink to="/system"><Activity size={14} /> <span className="label">Platform Status</span></NavLink>
        </nav>
        <div className="spacer" />
        <span className="user secondary" style={{ fontSize: 13 }}>{user?.name}</span>
        {!DEMO && !isPublic && <button className="btn small" onClick={logout} aria-label="Sign out"><LogOut size={14} /> <span className="label">Sign out</span></button>}
      </header>
      {isPublic && (
        <div className="notice demo" role="note">
          <span>
            <strong>Public Showcase</strong>: Hyperspectral mineral analysis platform powered by NASA EMIT spectroscopy and USGS endmembers.
            Live GPU compute pipeline and scene downloading run on the dedicated local cluster.
          </span>
        </div>
      )}
      {DEMO && (
        <div className="notice demo" role="note">
          <span>{DEMO_NOTE} Open a sample under <NavLink to="/jobs">Mineral Jobs</NavLink>. Code:{' '}
            <a href="https://github.com/ananthans-Techie/Mineral-Analysis" target="_blank" rel="noreferrer">GitHub</a></span>
        </div>
      )}
      <main className="main">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/" element={<RequireAuth><Shell><Workspace /></Shell></RequireAuth>} />
          <Route path="/jobs/:id" element={<RequireAuth><Shell><Workspace /></Shell></RequireAuth>} />
          <Route path="/jobs" element={<RequireAuth><Shell><History /></Shell></RequireAuth>} />
          <Route path="/system" element={<RequireAuth><Shell><System /></Shell></RequireAuth>} />
          {/* Explicit redirects for legacy/obsolete routes */}
          <Route path="/thermal/*" element={<Navigate to="/" replace />} />
          <Route path="/thermal" element={<Navigate to="/" replace />} />
          <Route path="/agriculture/*" element={<Navigate to="/" replace />} />
          <Route path="/agriculture" element={<Navigate to="/" replace />} />
          <Route path="/crops/*" element={<Navigate to="/" replace />} />
          <Route path="/crops" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}
