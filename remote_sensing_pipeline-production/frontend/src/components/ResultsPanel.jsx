import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Download } from 'lucide-react'
import { renderCategorical } from '../lib/cog'
import { dateOnly, fmt, pct } from '../lib/format'
import { isMainLayer, layerLabel, orderLayers } from '../lib/layers'
import { CompositionBars, Histogram, Legend, StatTile } from './charts'

// Agreement the deployed network must keep with the classical method (shadow check).
// Continuous maps are judged by nMAE (error as a share of the value's physical range):
// R² is shown for information only, because it collapses on areas whose values
// barely vary (e.g. a uniform field), even when the error is tiny.
const SHADOW_GATE = { pixel_agreement: 0.97, nmae: 0.05, r2: 0.95, mae: 0.05 }

function judged(m) {
  if (m.pixel_agreement !== undefined) return { metric: 'pixel_agreement', ok: m.pixel_agreement >= SHADOW_GATE.pixel_agreement }
  if (m.nmae !== undefined) return { metric: 'nmae', ok: m.nmae <= SHADOW_GATE.nmae }
  if (m.r2 !== undefined && m.r2 !== null) return { metric: 'r2', ok: m.r2 >= SHADOW_GATE.r2 }   // results from before nMAE
  return { metric: 'mae', ok: m.mae <= SHADOW_GATE.mae }
}

function agreementText(metric, m) {
  if (metric === 'pixel_agreement') return pct(m.pixel_agreement)
  if (metric === 'nmae') return `error ${pct(m.nmae)} of range`
  return `${metric.toUpperCase()} ${fmt(m[metric], 3)}`
}

function Verification({ verification }) {
  const rows = Object.entries(verification || {}).filter(([layer]) => layer.startsWith('mineral'))
  if (!rows.length) return null
  return (
    <details className="card" style={{ padding: '10px 12px', overflow: 'hidden' }}>
      <summary style={{ cursor: 'pointer', outline: 'none' }}>
        <strong>Checked against USGS SAM + SMA reference</strong>
        <span className="muted" style={{ fontSize: 12 }}> · on a sample of this area&apos;s pixels</span>
      </summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Mineral Layer</th>
              <th className="r">Agreement</th>
              <th className="r">Pixels</th>
              <th className="r">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([layer, m]) => {
              const { metric, ok } = judged(m)
              return (
                <tr key={layer}>
                  <td style={{ fontWeight: 500 }}>{layerLabel(layer)}</td>
                  <td className="r num" style={{ whiteSpace: 'nowrap' }}
                      title={metric === 'nmae' && m.r2 != null ? `MAE ${fmt(m.mae, 4)} · R² ${fmt(m.r2, 3)} (informative)` : undefined}>
                    {agreementText(metric, m)}
                  </td>
                  <td className="r num muted" style={{ whiteSpace: 'nowrap' }}>
                    {m.n?.toLocaleString() ?? m.n}
                  </td>
                  <td className="r" style={{ whiteSpace: 'nowrap', width: 72 }}>
                    {ok ? (
                      <span className="badge good" style={{ padding: '2px 6px', fontSize: 11 }}>
                        <CheckCircle2 size={11} /> pass
                      </span>
                    ) : (
                      <span className="badge critical" style={{ padding: '2px 6px', fontSize: 11 }}>
                        <CircleAlert size={11} /> differs
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Summary({ layers, result }) {
  const s = result?.summary || {}
  const frac = layers.find((l) => l.name === 'mineral_class')?.stats?.class_fraction || {}
  const top = Object.entries(frac).filter(([c]) => c !== 'unknown').sort((a, b) => b[1] - a[1])[0]
  const conf = layers.find((l) => l.name === 'mineral_confidence')?.stats || {}
  const qual = layers.find((l) => l.name === 'mineral_quality')?.stats || {}

  return (
    <div className="grid2">
      <StatTile label="Bare ground mapped" value={pct(s.mapped_fraction, 0)} sub="vegetation & water masked" />
      <StatTile label="Dominant mineral" value={top ? top[0] : '–'} sub={top ? pct(top[1]) : 'none detected'} />
      {conf.p50 != null && (
        <StatTile label="Median confidence" value={fmt(conf.p50, 2)} sub={`${pct(conf.valid_fraction || 0)} analyzed`} />
      )}
      {qual.p50 != null && (
        <StatTile label="Spectral quality" value={fmt(qual.p50, 2)} sub="SAM + SMA agreement" />
      )}
    </div>
  )
}

export const MINERAL_PALETTE = {
  alunite: '#e040fb',
  calcite: '#00e5ff',
  chlorite: '#2e7d32',
  dolomite: '#0284c7',
  goethite: '#d97706',
  gypsum: '#f97316',
  hematite: '#dc2626',
  illite: '#3b82f6',
  kaolinite: '#ec4899',
  montmorillonite: '#8b5cf6',
  muscovite: '#14b8a6',
  quartz: '#eab308',
  unknown: '#898781',
}

export default function ResultsPanel({ job, data, onOverlay, onRefresh }) {
  const task = 'mineral'
  const [layerName, setLayerName] = useState(null)
  const [opacity, setOpacity] = useState(0.85)
  const [highlight, setHighlight] = useState(null)
  const [rendered, setRendered] = useState(null)

  const list = useMemo(() => {
    const mineralLayers = data.layers.filter((l) => l.task === 'mineral' || l.name === 'landcover')
    return orderLayers(mineralLayers, 'mineral')
  }, [data])

  const layer = list.find((l) => l.name === layerName) || list[0]
  useEffect(() => { setLayerName(list[0]?.name || null); setHighlight(null) }, [list]) // eslint-disable-line

  const effectivePalette = useMemo(() => {
    if (layer?.name === 'mineral_class' && Array.isArray(layer.classes)) {
      return layer.classes.map((name, i) => MINERAL_PALETTE[name] || layer.stats?.palette?.[i] || '#898781')
    }
    return layer?.stats?.palette || []
  }, [layer])

  // Client-side COG re-colouring: draws every mineral in its distinct colour
  useEffect(() => {
    let live = true
    setRendered(null)
    if (layer?.name === 'mineral_class' && layer.tif_url) {
      const idx = highlight ? layer.classes.indexOf(highlight) : null
      renderCategorical(layer.tif_url, effectivePalette, idx).then((url) => live && setRendered(url)).catch(() => {})
    }
    return () => { live = false }
  }, [layer, highlight, effectivePalette])

  useEffect(() => {
    onOverlay(layer ? [{ key: `${layer.task}/${layer.name}/${highlight || ''}/${rendered ? 1 : 0}`,
      url: rendered || layer.png_url, bounds: layer.bounds, opacity, onError: onRefresh }] : [])
  }, [layer, opacity, rendered, highlight, onOverlay, onRefresh])

  if (!list.length) return <div className="card"><p className="muted">No mineral maps were produced for this job.</p></div>
  const result = data.results?.mineral || data.results?.[Object.keys(data.results || {})[0]]
  const acquired = job.acquired_emit || job.acquired_landsat
  const classRows = layer?.kind === 'categorical' ? (layer.classes || []).map((c, i) => ({
    name: c, color: effectivePalette[i] || layer.stats?.palette?.[i] || '#898781', fraction: layer.stats?.class_fraction?.[c] || 0,
    pixels: layer.stats?.class_pixels?.[c], group: layer.stats?.groups?.[c],
  })).filter((r) => r.color !== '#00000000').sort((a, b) => b.fraction - a.fraction) : []

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Mineral Analysis Results</h2>
        <span className="badge good">EMIT Hyperspectral</span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        NASA EMIT · Acquired {dateOnly(acquired)} · Spectroscopy Model {result?.model_version || job.model_version}
        {result?.summary?.granule_id ? ` · ${result.summary.granule_id}` : ''}
      </p>

      <label className="field">Mineral map layer
        <select value={layer?.name || ''} onChange={(e) => { setLayerName(e.target.value); setHighlight(null) }}>
          <optgroup label="Main Mineral Products">
            {list.filter((l) => isMainLayer(l.name, task)).map((l) => <option key={l.name} value={l.name}>{layerLabel(l.name)}</option>)}
          </optgroup>
          {list.some((l) => !isMainLayer(l.name, task)) && (
            <optgroup label="Fractional Abundances & Detail">
              {list.filter((l) => !isMainLayer(l.name, task)).map((l) => <option key={l.name} value={l.name}>{layerLabel(l.name)}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label className="field">Opacity {Math.round(opacity * 100)} %
        <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
      </label>

      <div>
        <h3>{layerLabel(layer?.name || '')}</h3>
        <Legend layer={layer} palette={effectivePalette} />
      </div>

      {layer?.name === 'mineral_class' && (
        <label className="field">Highlight one mineral
          <select value={highlight || ''} onChange={(e) => setHighlight(e.target.value || null)}>
            <option value="">All minerals (distinct mineral colors)</option>
            {classRows.filter((r) => r.fraction > 0).map((r) => <option key={r.name} value={r.name}>{r.name} ({pct(r.fraction)})</option>)}
          </select>
        </label>
      )}

      <Summary layers={list} result={result} />

      {layer?.kind === 'categorical'
        ? <CompositionBars rows={classRows} onPick={layer.name === 'mineral_class' ? setHighlight : null} picked={highlight} />
        : <Histogram histogram={layer?.stats?.histogram} units={layer?.units}
                     color="var(--series-1)" />}

      <Verification verification={result?.verification} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <div className="row between">
          <a className="btn small" href={layer?.tif_url} download><Download size={13} /> GeoTIFF ({layerLabel(layer?.name || '')})</a>
          <span className="muted num" style={{ fontSize: 11 }}>EPSG:4326 · Cloud-optimised</span>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>Direct raster layer download for GIS analysis (QGIS, ArcGIS, GDAL).</span>
      </div>
    </div>
  )
}
