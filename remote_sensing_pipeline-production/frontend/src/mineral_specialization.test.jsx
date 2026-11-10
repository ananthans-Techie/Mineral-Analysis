import { describe, expect, it } from 'vitest'
import { isMainLayer, layerLabel, orderLayers, TASKS } from './lib/layers'
import { LOCAL_DEV_USER } from './api'

describe('Mineral Specialization - Layer configuration', () => {
  it('correctly provides mineral analysis task metadata', () => {
    expect(TASKS.mineral).toBeDefined()
    expect(TASKS.mineral.label).toBe('Mineral Analysis')
    expect(TASKS.mineral.blurb).toContain('USGS library')
  })

  it('labels all key mineral layers accurately', () => {
    expect(layerLabel('mineral_class')).toBe('Dominant mineral')
    expect(layerLabel('mineral_confidence')).toBe('Classification confidence')
    expect(layerLabel('mineral_quality')).toBe('Quality (SAM + SMA)')
    expect(layerLabel('mineral_abundance')).toBe('Abundances (all minerals)')
    expect(layerLabel('mineral_abundance_kaolinite')).toBe('Abundance: kaolinite')
    expect(layerLabel('mineral_abundance_alunite')).toBe('Abundance: alunite')
    expect(layerLabel('mineral_abundance_quartz')).toBe('Abundance: quartz')
  })

  it('correctly classifies main mineral layers', () => {
    expect(isMainLayer('mineral_class', 'mineral')).toBe(true)
    expect(isMainLayer('mineral_abundance_kaolinite', 'mineral')).toBe(false)
  })

  it('ranks mineral primary layers first (class, confidence, quality, landcover)', () => {
    const layers = [
      { name: 'mineral_abundance_quartz', task: 'mineral' },
      { name: 'mineral_confidence', task: 'mineral' },
      { name: 'mineral_class', task: 'mineral' },
      { name: 'mineral_quality', task: 'mineral' },
      { name: 'landcover', task: 'mineral' },
      { name: 'mineral_abundance_alunite', task: 'mineral' },
    ]
    const ordered = orderLayers(layers, 'mineral').map((l) => l.name)
    expect(ordered[0]).toBe('mineral_class')
    expect(ordered[1]).toBe('mineral_confidence')
    expect(ordered[2]).toBe('mineral_quality')
    expect(ordered[3]).toBe('landcover')
    expect(ordered.slice(4)).toEqual(['mineral_abundance_alunite', 'mineral_abundance_quartz'])
  })

  it('filters out non-mineral layers from mineral-ordered output', () => {
    const mixed = [
      { name: 'thermal_lst', task: 'thermal' },
      { name: 'agri_LAI', task: 'agriculture' },
      { name: 'mineral_class', task: 'mineral' },
      { name: 'mineral_confidence', task: 'mineral' },
    ]
    const mineralOnly = orderLayers(mixed, 'mineral').map((l) => l.name)
    expect(mineralOnly).toEqual(['mineral_class', 'mineral_confidence'])
    expect(mineralOnly).not.toContain('thermal_lst')
    expect(mineralOnly).not.toContain('agri_LAI')
  })
})

describe('Mineral Platform - Local Development Access Mode', () => {
  it('defines a valid local development researcher identity with admin role', () => {
    expect(LOCAL_DEV_USER).toBeDefined()
    expect(LOCAL_DEV_USER.id).toBe(1)
    expect(LOCAL_DEV_USER.email).toBe('dev@mineralanalysis.local')
    expect(LOCAL_DEV_USER.name).toBe('Local Researcher')
    expect(LOCAL_DEV_USER.role).toBe('admin')
  })
})
