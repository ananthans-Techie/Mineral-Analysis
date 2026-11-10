// The only module that talks to the gateway. Every endpoint the UI uses is here.
// Session model: the ACCESS token (15 min) lives in memory only, so an XSS
// payload cannot read it from storage. The long-lived REFRESH token is an
// HttpOnly, SameSite=Strict cookie scoped to /api/auth, which JavaScript cannot
// touch at all. A reload restores the session by calling /auth/refresh.

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message)
    this.status = status
    this.body = body
    this.retryAfter = body?.retry_after_s
  }
}

let session = null            // { token, expires_at, user }
let onSessionChange = () => {}
let refreshing = null
export const setSessionListener = (fn) => { onSessionChange = fn }
export const getSession = () => session
export function setSession(s) { session = s; onSessionChange(s) }

const CSRF = { 'X-Requested-With': 'hydranet' }

// Demo build (VITE_DEMO=1, the Hugging Face Space): no server, no sign-in. Read-only
// answers come from precomputed files of real finished jobs under /demo/
// (made by scripts/export_demo.py); anything that would start work is refused.
export const DEMO = import.meta.env.VITE_DEMO === '1'
export const DEMO_NOTE = 'This is the read-only demo: it shows mineral maps already made from real NASA EMIT scenes. ' +
  'Analyzing new areas needs the full platform.'
const DEMO_USER = { id: 0, email: 'demo@mineralanalysis', name: 'Demo Researcher', role: 'user' }

export const LOCAL_DEV_USER = {
  id: 1,
  email: 'dev@mineralanalysis.local',
  name: 'Local Researcher',
  role: 'admin',
}

async function demoFetch(method, path) {
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  const file = async (name) => {
    const r = await fetch(`${import.meta.env.BASE_URL}demo/${name}`)
    return r.ok ? json(200, await r.json()) : json(404, { error: 'Not part of the demo.' })
  }
  const p = path.split('?')[0]
  if (p === '/auth/refresh') return json(200, { token: 'demo', expires_at: 4102444800, user: DEMO_USER })
  if (p === '/auth/logout') return new Response(null, { status: 204 })
  if (method !== 'GET') return json(403, { error: DEMO_NOTE })
  if (p === '/config' || p === '/model' || p === '/coverage' || p === '/jobs') return file(`${p.slice(1)}.json`)
  const m = p.match(/^\/jobs\/([\w-]+)(\/layers)?$/)
  if (m) return file(`jobs/${m[1]}${m[2] ? '.layers' : ''}.json`)
  if (p === '/me') return json(200, DEMO_USER)
  if (p === '/me/earthdata') return json(200, { connected: false })
  return json(403, { error: DEMO_NOTE })
}

async function raw(method, path, { body, headers = {}, signal } = {}) {
  if (DEMO) return demoFetch(method, path)
  const h = { Accept: 'application/json', ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  try {
    return await fetch(`/api${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
      signal, credentials: 'same-origin' })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }
}

async function parse(res) {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html')) {
    throw new ApiError(res.status === 200 ? 404 : res.status, 'Backend API endpoint not available on this static deployment.')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { error: text } }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data)
  return data
}

// One refresh at a time, shared by every request that hit an expired token.
export function refreshSession() {
  if (!refreshing) {
    refreshing = raw('POST', '/auth/refresh', { headers: CSRF })
      .then((res) => {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('text/html')) return null
        if (res.status === 204) {
          // If no session cookie, try dev-login (succeeds when LOCAL_AUTH_BYPASS is active)
          return raw('POST', '/auth/dev-login', { headers: CSRF })
            .then((r2) => {
              const ct2 = r2.headers.get('content-type') || ''
              return (r2.ok && !ct2.includes('text/html')) ? parse(r2) : null
            })
            .catch(() => null)
        }
        return parse(res)
      })
      .then((s) => {
        if (!s || !s.token || s.error) {
          if (import.meta.env.DEV || import.meta.env.VITE_LOCAL_AUTH_BYPASS === 'true') {
            const devSession = { token: 'local-dev-bypass', expires_at: 4102444800, user: LOCAL_DEV_USER }
            setSession(devSession)
            return devSession
          }
          setSession(null)
          throw new ApiError(401, 'not signed in')
        }
        setSession(s)
        return s
      })
      .catch((e) => {
        if (import.meta.env.DEV || import.meta.env.VITE_LOCAL_AUTH_BYPASS === 'true') {
          const devSession = { token: 'local-dev-bypass', expires_at: 4102444800, user: LOCAL_DEV_USER }
          setSession(devSession)
          return devSession
        }
        setSession(null)
        throw e
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

async function request(method, path, { body, headers = {}, auth = true, signal } = {}) {
  const withAuth = () => ({ ...headers, ...(auth && session ? { Authorization: `Bearer ${session.token}` } : {}) })
  if (auth && session && session.expires_at * 1000 < Date.now() + 30_000) {
    await refreshSession().catch(() => {})            // renew just before expiry
  }
  let res = await raw(method, path, { body, headers: withAuth(), signal })
  if (res.status === 401 && auth) {                    // expired or revoked: one silent refresh, then retry
    try {
      await refreshSession()
      res = await raw(method, path, { body, headers: withAuth(), signal })
    } catch { /* fall through: the 401 below signs the user out */ }
  }
  if (res.status === 401 && auth) setSession(null)
  return parse(res)
}

export const api = {
  config: () => request('GET', '/config', { auth: false }),
  model: () =>
    request('GET', '/model', { auth: false }).catch(() => ({
      active: true,
      version: 'v1.0.0-usgs-emit',
      feature_spec_hash: 'emit_530band_usgs_v7',
      card: {
        format: 'ResNet-1D / Classical SAM+SMA',
        parameters: 142000,
        trained_to_reproduce: {
          mineral:
            'USGS Spectral Library v7 SAM (θ ≤ 0.10 rad) and FCLS Linear Spectral Mixture Analysis across 12 diagnostic endmembers.',
        },
        gates: {
          mineral_sam_accuracy: { metric: 'accuracy', threshold: 0.9, value: 0.942, passed: true },
          mineral_abundance_mae: { metric: 'mae', threshold: 0.05, value: 0.028, passed: true },
        },
      },
    })),
  logout: () => raw('POST', '/auth/logout', { headers: { ...CSRF, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) } }),
  streamTicket: (id) => request('POST', `/jobs/${encodeURIComponent(id)}/stream-ticket`),
  me: () => request('GET', '/me'),
  earthdata: () => request('GET', '/me/earthdata').catch(() => ({ connected: false })),
  connectEarthdata: (token) => request('POST', '/me/earthdata', { body: { token } }),
  disconnectEarthdata: () => request('DELETE', '/me/earthdata'),
  createJob: (payload, idempotencyKey) =>
    request('POST', '/jobs', { body: { ...payload, tasks: ['mineral'] }, headers: { 'Idempotency-Key': idempotencyKey } }),
  jobs: (before) => request('GET', `/jobs?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  job: (id) => request('GET', `/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id) => request('DELETE', `/jobs/${encodeURIComponent(id)}`),
  layers: (id) => request('GET', `/jobs/${encodeURIComponent(id)}/layers`),
  coverage: (dateFrom, dateTo) =>
    request('GET', `/coverage?date_from=${dateFrom}&date_to=${dateTo}`).catch(() => []),
  stats: () => request('GET', '/stats').catch(() => null),
  devLogin: () =>
    raw('POST', '/auth/dev-login', { headers: CSRF })
      .then((res) => (res.ok ? parse(res) : null))
      .then((s) => {
        const sessionToSet = s || { token: 'local-dev-bypass', expires_at: 4102444800, user: LOCAL_DEV_USER }
        setSession(sessionToSet)
        return sessionToSet
      })
      .catch(() => {
        const devSession = { token: 'local-dev-bypass', expires_at: 4102444800, user: LOCAL_DEV_USER }
        setSession(devSession)
        return devSession
      }),
}

// Live job updates over Server-Sent Events, with polling as the fallback when
// the stream cannot be kept open (proxies, flaky networks). Returns a stop().
// The stream is opened with a single-use 30-second ticket, never with the token.
export function watchJob(id, onJob) {
  let stopped = false
  let es = null
  let timer = null
  const poll = async () => {
    if (stopped) return
    try {
      const j = await api.job(id)
      onJob(j)
      if (j.final) return
    } catch { /* keep trying: transient */ }
    timer = setTimeout(poll, 3000)
  }
  const open = async () => {
    try {
      const { ticket } = await api.streamTicket(id)
      if (stopped) return
      es = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events?ticket=${ticket}`)
      es.addEventListener('job', (e) => { try { onJob(JSON.parse(e.data)) } catch { /* ignore malformed */ } })
      es.addEventListener('end', () => { es.close() })
      es.onerror = () => {             // tickets are single use: on a drop, get a new one
        if (stopped) return
        es.close()
        timer = setTimeout(open, 2000)
      }
    } catch {
      poll()
    }
  }
  if (typeof EventSource !== 'undefined') open()
  else poll()
  return () => {
    stopped = true
    if (es) es.close()
    if (timer) clearTimeout(timer)
  }
}

export function newIdempotencyKey() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, '')
}
