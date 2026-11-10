import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Crosshair, Play } from 'lucide-react'
import { api, ApiError, newIdempotencyKey } from '../api'
import { useAuth } from '../auth'
import { scenesCovering } from '../lib/coverage'
import { bboxAreaKm2, dateOnly, todayIso } from '../lib/format'
import EarthdataDialog from './EarthdataDialog'

function validBox(b, region, maxDeg) {
  if (!b || b.some((v) => !Number.isFinite(v))) return 'Enter four numbers'
  if (b[0] >= b[2] || b[1] >= b[3]) return 'West must be less than east and south less than north'
  if (b[2] - b[0] > maxDeg + 1e-9 || b[3] - b[1] > maxDeg + 1e-9) return `At most ${maxDeg}° per side`
  if (b[2] - b[0] < 0.002 || b[3] - b[1] < 0.002) return 'At least 0.002° per side'
  if (b[0] < region[0] || b[1] < region[1] || b[2] > region[2] || b[3] > region[3]) return 'Outside the supported region'
  return null
}

export default function JobForm({ config, bbox, setBbox, drawing, setDrawing, onSubmitted, dates, setDates, coverage }) {
  const { isPublic } = useAuth()
  const tasks = useMemo(() => ['mineral'], [])
  const [nasa, setNasa] = useState(null)              // { connected, expired, username, expires_at }
  const [connectFor, setConnectFor] = useState(null)  // why the NASA popup is open: 'mineral', 'submit' or 'change'
  const [dateFrom, dateTo] = dates
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [edit, setEdit] = useState(null)
  const idemKey = useMemo(newIdempotencyKey, [bbox, dateFrom, dateTo])
  const scenes = useMemo(() => scenesCovering(coverage, bbox), [coverage, bbox])

  useEffect(() => {
    api.earthdata().then((s) => {
      setNasa(s)
    }).catch(() => setNasa({ connected: false }))
  }, [])

  const boxError = bbox ? validBox(bbox, config.allowed_region, config.max_bbox_deg) : null

  async function submit(e) {
    e?.preventDefault()
    if (isPublic) {
      setError(
        'Cluster Pipeline Required: Interactive EMIT hyperspectral scene downloading, calibration, and GPU inference (SAM classification + SMA unmixing) run on the dedicated local cluster. This public static showcase demonstrates interactive mapping and USGS specifications without consuming cluster compute resources.'
      )
      return
    }
    if (!nasa?.connected) {
      setConnectFor('submit')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const job = await api.createJob({ bbox, tasks, date_from: dateFrom, date_to: dateTo }, idemKey)
      onSubmitted(job)
    } catch (err) {
      if (err instanceof ApiError && err.body?.code === 'earthdata_required') {   // missing or expired since
        api.earthdata().then(setNasa).catch(() => {})
        setConnectFor('submit')
      } else {
        setError(err instanceof ApiError && err.status === 429
          ? `${err.message}${err.retryAfter ? ` (retry in ${err.retryAfter} s)` : ''}` : err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const connectDone = (status) => {
    const why = connectFor
    setConnectFor(null)
    if (status) {
      setNasa(status)
      if (why === 'submit') submit()
    }
  }

  const disconnect = async () => {
    try {
      await api.disconnectEarthdata()
      setNasa({ connected: false })
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = () => setEdit((bbox || [0, 0, 0, 0]).map((v) => v.toFixed(4)))
  const applyEdit = () => {
    const b = edit.map(Number)
    const err = validBox(b, config.allowed_region, config.max_bbox_deg)
    if (err) { setError(err); return }
    setError(null); setBbox(b); setEdit(null)
  }

  return (
    <>
      <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2>1. Area</h2>
          {bbox ? (
            <p className="secondary num" style={{ fontSize: 12 }}>
              {bbox.map((v) => v.toFixed(4)).join(', ')} · ≈ {bboxAreaKm2(bbox).toFixed(0)} km²
            </p>
          ) : <p className="muted">Draw a box on the map, or type its corners.</p>}
          {boxError && <p style={{ color: 'var(--critical)', fontSize: 12 }}>{boxError}</p>}
          {edit ? (
            <div className="grid2" style={{ marginTop: 6 }}>
              {['West (lon)', 'South (lat)', 'East (lon)', 'North (lat)'].map((lbl, i) => (
                <label className="field" key={lbl}>{lbl}
                  <input type="number" step="0.0001" value={edit[i]} onChange={(e) => {
                    const n = [...edit]; n[i] = e.target.value; setEdit(n)
                  }} />
                </label>
              ))}
              <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={applyEdit}>Apply</button>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className={`btn ${drawing ? 'primary' : ''}`} onClick={() => setDrawing(!drawing)}>
                <Crosshair size={14} /> {drawing ? 'Drawing… (Esc)' : 'Draw area'}
              </button>
              <button type="button" className="btn" onClick={startEdit}>Enter coordinates</button>
            </div>
          )}
        </div>

        <div>
          <h2>2. Mineral Pipeline</h2>
          <div className="row wrap">
            <span className="chip on" style={{ cursor: 'default' }}>
              <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--good)' }} />
              Dominant Mineral & Fractional Abundances (12 USGS Endmembers)
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Applies Spectral Angle Mapper (SAM) classification, confidence scoring, and Fully Constrained Least Squares (SMA) unmixing.
          </p>
          {nasa?.connected ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              <CheckCircle2 size={12} style={{ verticalAlign: -2, color: 'var(--good)' }} /> NASA Earthdata connected
              {nasa.username && ` as ${nasa.username}`}{nasa.expires_at && `, until ${dateOnly(nasa.expires_at)}`} ·{' '}
              <button type="button" className="link" onClick={() => setConnectFor('change')}>Change</button> ·{' '}
              <button type="button" className="link" onClick={disconnect}>Disconnect</button>
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 6px 0' }}>
                {nasa?.expired
                  ? `Your NASA token expired on ${dateOnly(nasa.expires_at)}. `
                  : 'NASA Earthdata token is required to download NASA EMIT hyperspectral scenes. '}
              </p>
              <button type="button" className="btn small" onClick={() => setConnectFor('mineral')}>
                Connect NASA Earthdata
              </button>
            </div>
          )}
        </div>

        <div>
          <h2>3. Imagery dates</h2>
          <div className="grid2">
            <label className="field">From<input type="date" value={dateFrom} max={dateTo} onChange={(e) => e.target.value && setDates([e.target.value, dateTo])} /></label>
            <label className="field">To<input type="date" value={dateTo} min={dateFrom} max={todayIso()} onChange={(e) => e.target.value && setDates([dateFrom, e.target.value])} /></label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            The clearest NASA EMIT hyperspectral scene within this date window will be processed.
          </p>
          {bbox && !boxError && coverage && (scenes.length > 0 ? (
            <div className="notice good" role="status"><CheckCircle2 size={14} /><span>
              {`${scenes.length} EMIT hyperspectral scene${scenes.length > 1 ? 's' : ''} cover this area in these dates. `}
              {`Will process ${scenes[0].acquired_at} (${Math.round(scenes[0].cloud_pct ?? 0)} % cloud)`}
              {scenes[0].staged ? ', already staged: ready in seconds.' : ', first use retrieves from NASA.'}
            </span></div>
          ) : (
            <div className="notice warning" role="status"><AlertTriangle size={14} /><span>
              No NASA EMIT scene covers this bounding box in these dates. Move inside the bright EMIT coverage swath or widen the dates.
            </span></div>
          ))}
        </div>

        {error && <div className="notice error" role="alert">{error}</div>}
        <button
          className="btn primary block"
          disabled={busy || !bbox || !!boxError || tasks.length === 0}
          title={isPublic ? 'Live GPU cluster execution runs on dedicated local infrastructure' : undefined}
        >
          <Play size={14} /> {busy ? 'Running Mineral Analysis…' : isPublic ? 'Run Mineral Analysis (Cluster Required)' : 'Run Mineral Analysis'}
        </button>
      </form>
      {/* outside the form: it has its own (a token field must not submit the job) */}
      <EarthdataDialog reason={connectFor} status={nasa} onDone={connectDone} />
    </>
  )
}
