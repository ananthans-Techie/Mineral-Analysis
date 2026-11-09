import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { bboxLabel, when } from '../lib/format'
import { STATUS_TONE } from '../lib/layers'

export default function History() {
  const [jobs, setJobs] = useState(null)
  const [next, setNext] = useState(null)
  const [error, setError] = useState(null)
  const load = (before) => api.jobs(before).then((r) => {
    setJobs((cur) => (before ? [...(cur || []), ...r.jobs] : r.jobs))
    setNext(r.next_before || null)
  }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  return (
    <div className="page"><div className="page-narrow">
      <h1>Mineral Analysis Jobs</h1>
      <p className="secondary">All mineral identification and spectroscopy jobs. Raster outputs are preserved for 180 days.</p>
      {error && <div className="notice error">{error}</div>}
      <div className="card" style={{ marginTop: 12 }}>
        {!jobs ? <p className="muted">Loading…</p> : jobs.length === 0 ? (
          <p className="muted">No mineral jobs yet. <Link to="/">Analyze your first area</Link>.</p>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Submitted</th><th className="hide-phone">Coordinates</th><th>Analysis</th><th className="hide-phone">Sensor</th><th>Status</th><th /></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.job_id}>
                <td>{when(j.created_at)}</td>
                <td className="num secondary hide-phone" style={{ fontSize: 12 }}>{bboxLabel(j.bbox)}</td>
                <td>{j.tasks.includes('mineral') ? 'Mineral Analysis' : 'Mineral Analysis'}</td>
                <td className="hide-phone">NASA EMIT</td>
                <td><span className={`badge ${STATUS_TONE[j.status] || ''}`}>{j.status.toLowerCase().replace('_', ' ')}</span></td>
                <td className="r"><Link to={`/jobs/${j.job_id}`}>Open</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {next && <button className="btn" style={{ marginTop: 10 }} onClick={() => load(next)}>Load older</button>}
      </div>
    </div></div>
  )
}
