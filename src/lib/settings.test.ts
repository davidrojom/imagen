import { describe, expect, it } from 'vitest'
import {
  defaultEncodeSettings,
  defaultResizeSettings,
  mergeEncodeSettings,
  resolveSettings,
} from './settings'
import type { EncodeSettings } from '../types'

describe('defaultResizeSettings', () => {
  it('defaults to no resize with keepAspect true', () => {
    expect(defaultResizeSettings()).toEqual({ mode: 'none', keepAspect: true })
  })
})

describe('defaultEncodeSettings', () => {
  it('builds defaults for a quality-based format', () => {
    const s = defaultEncodeSettings('webp')
    expect(s.format).toBe('webp')
    expect(s.quality).toBe(75)
    expect(s.resize.mode).toBe('none')
  })

  it('builds level-based defaults for oxipng (no quality)', () => {
    const s = defaultEncodeSettings('oxipng')
    expect(s.format).toBe('oxipng')
    expect(s.quality).toBeUndefined()
    expect(s.effort).toBe(2)
  })
})

describe('mergeEncodeSettings', () => {
  const base = defaultEncodeSettings('webp')

  it('applies a shallow patch', () => {
    expect(mergeEncodeSettings(base, { quality: 90 }).quality).toBe(90)
  })

  it('deep-merges resize settings', () => {
    const merged = mergeEncodeSettings(base, { resize: { mode: 'percentage', percentage: 50 } })
    expect(merged.resize).toEqual({ mode: 'percentage', percentage: 50, keepAspect: true })
  })

  it('resets quality/effort to the new format defaults when format changes', () => {
    const merged = mergeEncodeSettings(base, { format: 'avif' })
    expect(merged.format).toBe('avif')
    expect(merged.quality).toBe(50)
    expect(merged.effort).toBe(6)
  })

  it('clears quality when switching to a level-only format', () => {
    const merged = mergeEncodeSettings(base, { format: 'oxipng' })
    expect(merged.quality).toBeUndefined()
    expect(merged.effort).toBe(2)
  })

  it('honors an explicit quality even when the format changes', () => {
    const merged = mergeEncodeSettings(base, { format: 'avif', quality: 30 })
    expect(merged.quality).toBe(30)
  })

  it('does not mutate the base object', () => {
    const snapshot: EncodeSettings = JSON.parse(JSON.stringify(base))
    mergeEncodeSettings(base, { quality: 10, resize: { mode: 'percentage', percentage: 10 } })
    expect(base).toEqual(snapshot)
  })
})

describe('resolveSettings', () => {
  const global = defaultEncodeSettings('webp')

  it('returns the global settings when there is no override', () => {
    expect(resolveSettings(null, global)).toBe(global)
  })

  it('returns the override when present', () => {
    const override = defaultEncodeSettings('avif')
    expect(resolveSettings(override, global)).toBe(override)
  })
})
