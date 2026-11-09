import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { StatTile } from '../components/charts'
import { duration, fmt, when } from '../lib/format'
import { layerLabel, TASKS } from '../lib/layers'

function GateTable({ gates, title }) {
  const rows = Object.entries(gates || {}).filter(([k]) => k.startsWith('mineral'))
  if (!rows.length) return null
  return (
    <div>
      <h3>{title}</h3>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Check</th><th className="r">Model vs USGS Classical</th><th className="r">Required</th><th>Result</th></tr></thead>
        <tbody>{rows.map(([k, g]) => (
          <tr key={k}>
            <td>{layerLabel(k.includes('.') ? k : k)}{g.metric ? <span className="muted"> · {g.metric.replace('_', ' ')}</span> : ''}</td>
            <td className="r">{fmt(g.value, 4)}</td>
            <td className="r">{['mae', 'nmae'].includes(g.metric) || k.endsWith('_mae') ? '≤ ' : '≥ '}{g.threshold}</td>
            <td>{g.passed === null || g.passed === undefined ? <span className="badge">n/a</span>
              : g.passed ? <span className="badge good"><CheckCircle2 size={12} /> pass</span>
                : <span className="badge critical"><CircleAlert size={12} /> fail</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}

export default function System() {
  const [stats, setStats] = useState(null)
  const [model, setModel] = useState(null)
  const [error, setError] = useState(null)
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  useEffect(() => {
    const load = () => Promise.all([admin ? api.stats() : Promise.resolve(null), api.model()])
      .then(([s, m]) => { setStats(s); setModel(m) })
      .catch((e) => setError(e.message))
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [admin])
  const card = model?.card || {}
  const mineralTasks24h = (stats?.tasks_24h || []).filter((r) => r.task === 'mineral')

  return (
    <div className="page"><div className="page-narrow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1>Mineral Analysis Platform</h1>
        <p className="secondary">{admin ? 'Processing throughput over the last 24 hours, and mineral spectroscopy model verification.'
          : 'Mineral spectroscopy model status and USGS classical method verification.'}</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      {stats && (
        <div className="card">
          <div className="grid4">
            <StatTile label="Mineral jobs active" value={stats.active_jobs} sub={`${stats.queued_jobs} waiting`} />
            <StatTile label="Completed (24 h)" value={stats.completed_24h} sub={`${stats.failed_24h} failed`} />
            <StatTile label="Median analysis latency" value={duration(stats.latency_p50_s)} />
            <StatTile label="95th percentile" value={duration(stats.latency_p95_s)} />
          </div>
        </div>
      )}
      {mineralTasks24h.length > 0 && (
        <div className="card">
          <h2>Mineral Analysis Outcomes (24 h)</h2>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Pipeline</th><th>Outcome</th><th className="r">Count</th></tr></thead>
            <tbody>{mineralTasks24h.map((r) => (
              <tr key={`${r.task}-${r.state}`}><td>{TASKS[r.task]?.label || 'Mineral Analysis'}</td>
                <td className="secondary">{r.state.toLowerCase().replace('_', ' ')}</td><td className="r">{r.count}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Mineral Spectroscopy Model {model?.version || ''}</h2>
          {model?.active ? <span className="badge">promoted {when(model.promoted_at)}</span> : <span className="badge warning">no model yet</span>}
        </div>
        {model?.active ? (
          <>
            <p className="secondary">
              Hyperspectral spectroscopy neural network with 530 mineral features ({card.format?.toUpperCase()}, {card.parameters?.toLocaleString()} parameters),
              trained to reproduce the USGS Spectral Library SAM classification and SMA unmixing. Feature spec <span className="num">{model.feature_spec_hash}</span>.
            </p>
            <div className="table-wrap"><table className="data"><tbody>
              {Object.entries(card.trained_to_reproduce || {})
                .filter(([k]) => k === 'mineral')
                .map(([k, v]) => (
                  <tr key={k}><td style={{ width: 140, fontWeight: 500 }}>{TASKS[k]?.label || 'Mineral Analysis'}</td><td className="secondary">{v}</td></tr>
                ))}
            </tbody></table></div>
            <GateTable title="Scene verification (EMIT scenes against SAM + SMA reference)" gates={model.map_verification?.gates} />
            <GateTable title="Training gates (measured on held-out test spectra)" gates={card.gates} />
          </>
        ) : <p className="muted">Train and promote a mineral model.</p>}
      </div>
    </div></div>
  )
}
