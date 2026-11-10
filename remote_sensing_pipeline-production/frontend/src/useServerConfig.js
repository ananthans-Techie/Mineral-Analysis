import { useEffect, useState } from 'react'
import { api } from './api'

let cached = null

// Server-side limits (region, bbox size, tasks). Never duplicated in the UI.
export function useServerConfig() {
  const [config, setConfig] = useState(cached)
  useEffect(() => {
    if (cached) return
    api.config().then((c) => {
      if (c && Array.isArray(c.allowed_region)) {
        const specialized = { ...c, tasks: ['mineral'] }
        cached = specialized
        setConfig(specialized)
      } else {
        throw new Error('Non-JSON config response')
      }
    }).catch(() => {
      // Static / public fallback: keeps the UI usable when no local gateway is connected
      const fallback = {
        allowed_region: [-124.5, 32.5, -114, 42],
        max_bbox_deg: 0.1,
        tasks: ['mineral'],
        is_public_fallback: true,
      }
      cached = fallback
      setConfig(fallback)
    })
  }, [])
  return config
}
