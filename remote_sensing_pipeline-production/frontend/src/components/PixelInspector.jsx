import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { valueAt } from '../lib/cog'
import { fmt } from '../lib/format'
import { layerLabel } from '../lib/layers'

const MINERAL_KEY_LAYERS = new Set([
  'mineral_class', 'mineral_confidence', 'mineral_quality', 'landcover',
])

// Values of mineral maps at one clicked point, read straight from the COGs.
export default function PixelInspector({ point, layers, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!point) return undefined
    let live = true
    setRows(null)
    const wanted = layers.filter((l) => (l.task === 'mineral' || MINERAL_KEY_LAYERS.has(l.name) || l.name.startsWith('mineral_abundance_')) && !l.name.startsWith('agri_') && !l.name.startsWith('thermal_') && l.name !== 'ndvi')
    Promise.all(wanted.map(async (l) => {
      try {
        const v = await valueAt(l.tif_url, point[1], point[0])
        let text = '–'
        if (v !== null) {
          text = l.kind === 'categorical' ? (l.classes?.[v] ?? `class ${v}`) : `${fmt(v)} ${l.units}`
        }
        return { task: 'mineral', name: l.name, text }
      } catch {
        return { task: 'mineral', name: l.name, text: 'unavailable' }
      }
    })).then((r) => live && setRows(r))
    return () => { live = false }
  }, [point, layers])
  if (!point) return null
  return (
    <div className="card inspector" role="dialog" aria-label="Mineral pixel values">
      <div className="row between">
        <h2 style={{ margin: 0, fontSize: 15 }}>Mineral Pixel Inspector</h2>
        <button className="btn small" onClick={onClose} aria-label="Close"><X size={12} /></button>
      </div>
      <p className="muted num" style={{ fontSize: 12 }}>{point[0].toFixed(5)}°, {point[1].toFixed(5)}°</p>
      {!rows && <p className="muted">Reading spectral values from raster…</p>}
      {rows && (
        <div style={{ marginBottom: 4 }}>
          <table className="data"><tbody>
            {rows.map((r) => <tr key={r.name}><td style={{ fontWeight: 500 }}>{layerLabel(r.name)}</td><td className="r num">{r.text}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  )
}
