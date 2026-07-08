import { describe, expect, it } from 'vitest'
import { FORMATS, FORMAT_IDS, getFormatSpec } from './formats'
import type { OutputFormat } from '../types'

describe('formats registry', () => {
  it('covers exactly the five output formats', () => {
    expect(FORMAT_IDS).toEqual(['mozjpeg', 'webp', 'avif', 'oxipng', 'jxl'])
    expect(Object.keys(FORMATS).sort()).toEqual(
      [...FORMAT_IDS].sort(),
    )
  })

  it('maps each format to the correct mime and extension', () => {
    expect(FORMATS.mozjpeg.mime).toBe('image/jpeg')
    expect(FORMATS.mozjpeg.extension).toBe('jpg')
    expect(FORMATS.webp.mime).toBe('image/webp')
    expect(FORMATS.webp.extension).toBe('webp')
    expect(FORMATS.avif.mime).toBe('image/avif')
    expect(FORMATS.avif.extension).toBe('avif')
    expect(FORMATS.oxipng.mime).toBe('image/png')
    expect(FORMATS.oxipng.extension).toBe('png')
    expect(FORMATS.jxl.mime).toBe('image/jxl')
    expect(FORMATS.jxl.extension).toBe('jxl')
  })

  it('exposes a quality control for the lossy formats with sensible defaults', () => {
    for (const id of ['mozjpeg', 'webp', 'avif', 'jxl'] as OutputFormat[]) {
      const spec = getFormatSpec(id)
      expect(spec.hasQuality).toBe(true)
      expect(spec.quality).toBeDefined()
      expect(spec.quality!.min).toBe(0)
      expect(spec.quality!.max).toBe(100)
      expect(spec.quality!.default).toBeGreaterThan(0)
      expect(spec.quality!.default).toBeLessThanOrEqual(100)
    }
    expect(getFormatSpec('mozjpeg').quality!.default).toBe(75)
    expect(getFormatSpec('webp').quality!.default).toBe(75)
    expect(getFormatSpec('avif').quality!.default).toBe(50)
    expect(getFormatSpec('jxl').quality!.default).toBe(75)
  })

  it('uses an optimization level (not quality) for oxipng', () => {
    const spec = getFormatSpec('oxipng')
    expect(spec.hasQuality).toBe(false)
    expect(spec.quality).toBeUndefined()
    expect(spec.effort).toBeDefined()
    expect(spec.effort!.min).toBe(1)
    expect(spec.effort!.max).toBe(6)
    expect(spec.effort!.default).toBe(2)
    expect(spec.effort!.label).toBe('Level')
  })

  it('exposes effort controls for avif and jxl', () => {
    expect(getFormatSpec('avif').effort).toMatchObject({ default: 6, label: 'Speed' })
    expect(getFormatSpec('jxl').effort).toMatchObject({ default: 7, label: 'Effort' })
  })

  it('throws on an unknown format id', () => {
    expect(() => getFormatSpec('gif' as OutputFormat)).toThrow()
  })
})
