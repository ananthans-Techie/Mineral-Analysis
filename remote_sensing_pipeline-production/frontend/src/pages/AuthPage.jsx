import { useEffect } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { api } from '../api'
import { useAuth } from '../auth'
import { useServerConfig } from '../useServerConfig'

// Only same-site paths: never "//evil.example", "/\evil", or an absolute URL (open redirect).
// The gateway checks it again before redirecting.
function safePath(p) {
  return typeof p === 'string' && /^\/(?![/\\])[\w\-./?=&%]*$/.test(p) ? p : '/'
}

const ERRORS = {
  cancelled: 'Sign-in was cancelled.',
  not_allowed: 'This Google account is not allowed to use Mineral Analysis Platform. Ask the administrator for access.',
  unverified: 'Your Google account email is not verified.',
  conflict: 'This email is already linked to a different Google account.',
  expired: 'The sign-in took too long or was opened in another tab. Please try again.',
  state: 'The sign-in could not be verified. Please try again.',
  unavailable: 'Google sign-in is not available right now. Please try again in a minute.',
  failed: 'Google sign-in failed. Please try again.',
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function AuthPage() {
  const { signedIn, ready, isPublic } = useAuth()
  const config = useServerConfig()
  const location = useLocation()
  const [params] = useSearchParams()
  const from = safePath(location.state?.from || params.get('from'))
  const isDevAuth = config?.local_auth_bypass || import.meta.env.DEV || import.meta.env.VITE_LOCAL_AUTH_BYPASS === 'true'

  useEffect(() => {
    if (ready && !signedIn && isDevAuth) {
      api.devLogin().catch(() => {})
    }
  }, [ready, signedIn, isDevAuth])

  if (ready && signedIn) return <Navigate to={from} replace />

  const errorParam = params.get('error')
  const error = (!isDevAuth && !isPublic && errorParam) ? (ERRORS[errorParam] || ERRORS.failed) : null

  return (
    <div className="auth">
      <div className="card auth-card">
        <div className="auth-brand-container">
          <img
            src="/assets/mineral-analysis-logo.png"
            alt="Mineral Analysis Platform Logo"
            className="auth-brand-logo"
          />
        </div>
        <p className="secondary auth-subtitle">
          Hyperspectral Mineral Identification, Classification and Abundance Mapping
        </p>
        <h1>{isDevAuth ? 'Local Development Access' : isPublic ? 'Mineral Analysis Platform Portal' : 'Sign in'}</h1>
        {error && <div className="notice error" role="alert">{error}</div>}
        {isDevAuth ? (
          <>
            <button
              className="btn block primary"
              onClick={() => api.devLogin().catch(() => {})}
              style={{ marginTop: 12, justifyContent: 'center' }}
            >
              Enter Mineral Studio
            </button>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              Local development mode active (Google sign-in bypassed).
            </p>
          </>
        ) : isPublic ? (
          <>
            <p className="secondary" style={{ fontSize: 13, marginTop: 8 }}>
              Live processing workers and high-throughput GPU inference pipelines run on the dedicated local cluster.
              Explore interactive mapping, satellite swaths, and USGS reference methodology in Mineral Studio.
            </p>
            <Link
              to="/"
              className="btn block primary"
              style={{ marginTop: 16, justifyContent: 'center', textDecoration: 'none' }}
            >
              Enter Mineral Studio
            </Link>
          </>
        ) : (
          <>
            <a className="btn block google" href={`/api/auth/google/login?from=${encodeURIComponent(from)}`}>
              <GoogleMark /> Sign in with Google
            </a>
            <p className="muted" style={{ fontSize: 13 }}>Only approved research accounts can sign in.</p>
          </>
        )}
      </div>
    </div>
  )
}
