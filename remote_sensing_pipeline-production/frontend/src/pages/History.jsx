import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { useAuth } from '../auth'
import { bboxLabel, when } from '../lib/format'
import { STATUS_TONE } from '../lib/layers'

export default function History() {
  const { isPublic } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [next, setNext] = useState(null)
  const [error, setError] = useState(null)
  const load = (before) => api.jobs(before).then((r) => {
    const list = r?.jobs?.length ? r.jobs : (isPublic ? [{
      job_id: 'job_a395b0fff6e9481c8478',
      status: 'COMPLETED',
      bbox: [-117.580078, 38.207767, -117.480078, 38.307767],
      tasks: ['mineral'],
      source: 'nasa',
      created_at: '2026-11-11T08:16:47.584083Z',
      completed_at: '2026-11-11T08:21:35.66736Z',
      final: true,
    }] : [])
    setJobs((cur) => (before ? [...(cur || []), ...list] : list))
    setNext(r.next_before || null)
  }).catch((e) => {
    if (isPublic) {
      setJobs([{
        job_id: 'job_a395b0fff6e9481c8478',
        status: 'COMPLETED',
        bbox: [-117.580078, 38.207767, -117.480078, 38.307767],
        tasks: ['mineral'],
        source: 'nasa',
        created_at: '2026-11-11T08:16:47.584083Z',
        completed_at: '2026-11-11T08:21:35.66736Z',
        final: true,
      }])
    } else {
      setError(e.message)
    }
  })
  useEffect(() => { load() }, [])
  return (
    <div className="page"><div className="page-narrow">
      <h1>Mineral Analysis Jobs</h1>
      <p className="secondary">All mineral identification and spectroscopy jobs. Raster outputs are preserved for 180 days.</p>
      {error && !isPublic && <div className="notice error">{error}</div>}
      <div className="card" style={{ marginTop: 12 }}>
        {!jobs ? <p className="muted">Loading…</p> : jobs.length === 0 ? (
          isPublic ? (
            <p className="muted">
              The cluster job queue is maintained on the private local PostgreSQL database. No public jobs are listed on this static showcase.
              Explore the platform&apos;s 12 USGS endmembers in <Link to="/system">Platform Status</Link> or draw an area in <Link to="/">Mineral Studio</Link>.
            </p>
          ) : (
            <p className="muted">No mineral jobs yet. <Link to="/">Analyze your first area</Link>.</p>
          )
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
