import { useEffect, useState } from 'react'
import { api } from './api'

let cached = null

// Server-side limits (region, bbox size, tasks). Never duplicated in the UI.
export function useServerConfig() {
  const [config, setConfig] = useState(cached)
  useEffect(() => {
    if (cached) return
    api.config().then((c) => {
      const specialized = { ...c, tasks: ['mineral'] }
      cached = specialized
      setConfig(specialized)
    }).catch(() => {
      // keep the UI usable if /config is briefly unavailable; the server still enforces its limits
      const fallback = {
        allowed_region: [-124.5, 32.5, -114, 42],
        max_bbox_deg: 0.1,
        tasks: ['mineral'],
      }
      cached = fallback
      setConfig(fallback)
    })
  }, [])
  return config
}
