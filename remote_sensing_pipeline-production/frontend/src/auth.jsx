import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, getSession, refreshSession, setSession, setSessionListener } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setState] = useState(getSession())
  const [ready, setReady] = useState(false)
  const [isPublic, setIsPublic] = useState(false)

  useEffect(() => {
    setSessionListener(setState)
    // a reload: restore the session from the HttpOnly refresh cookie or local dev bypass, if any
    refreshSession()
      .then((s) => {
        setIsPublic(!s || !s.token)
      })
      .catch(() => {
        setIsPublic(true)
      })
      .finally(() => setReady(true))
  }, [])

  const value = useMemo(() => ({
    user: session?.user || (isPublic ? { id: 0, name: 'Guest Explorer', role: 'guest' } : null),
    signedIn: !!session,
    isPublic,
    ready,
    async logout() { await api.logout().catch(() => {}); setSession(null) },
  }), [session, ready, isPublic])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
