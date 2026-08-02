import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  avifOptions,
  codecApi,
  decodeToImageData,
  jxlOptions,
  mozjpegOptions,
  outputMimeFor,
  oxipngOptions,
  webpOptions,
} from './codecApi'
import { decode as avifDecode } from '@jsquash/avif'
import { decode as jxlDecode } from '@jsquash/jxl'
import { defaultEncodeSettings } from '../lib/settings'
import type { EncodeSettings } from '../types'

vi.mock('@jsquash/jxl', () => ({
  decode: vi.fn(() => ({ width: 2, height: 1, data: new Uint8ClampedArray(8) })),
  encode: vi.fn(),
}))

vi.mock('@jsquash/avif', () => ({
  decode: vi.fn(() => ({ width: 3, height: 1, data: new Uint8ClampedArray(12) })),
  encode: vi.fn(),
}))

function settings(patch: Partial<EncodeSettings>): EncodeSettings {
  return { ...defaultEncodeSettings(patch.format ?? 'webp'), ...patch }
}

describe('outputMimeFor', () => {
  it('maps each format id to its registry MIME type', () => {
    expect(outputMimeFor('mozjpeg')).toBe('image/jpeg')
    expect(outputMimeFor('webp')).toBe('image/webp')
    expect(outputMimeFor('avif')).toBe('image/avif')
    expect(outputMimeFor('oxipng')).toBe('image/png')
    expect(outputMimeFor('jxl')).toBe('image/jxl')
  })
})

describe('encode option mapping', () => {
  it('passes the chosen quality to mozjpeg', () => {
    expect(mozjpegOptions(settings({ format: 'mozjpeg', quality: 42 }))).toEqual({ quality: 42 })
  })

  it('falls back to the registry default quality for mozjpeg', () => {
    expect(mozjpegOptions(settings({ format: 'mozjpeg', quality: undefined }))).toEqual({ quality: 75 })
  })

  it('maps webp quality and effort->method', () => {
    expect(webpOptions(settings({ format: 'webp', quality: 60, effort: 6 }))).toEqual({
      quality: 60,
      method: 6,
    })
  })

  it('uses webp defaults (quality 75, method 4) when unset', () => {
    expect(webpOptions(settings({ format: 'webp', quality: undefined, effort: undefined }))).toEqual({
      quality: 75,
      method: 4,
    })
  })

  it('maps avif quality and effort->speed (default speed 6)', () => {
    expect(avifOptions(settings({ format: 'avif', quality: 30, effort: 2 }))).toEqual({
      quality: 30,
      speed: 2,
    })
    expect(avifOptions(settings({ format: 'avif', quality: undefined, effort: undefined }))).toEqual({
      quality: 50,
      speed: 6,
    })
  })

  it('maps jxl quality and effort (default effort 7)', () => {
    expect(jxlOptions(settings({ format: 'jxl', quality: 90, effort: 9 }))).toEqual({
      quality: 90,
      effort: 9,
    })
    expect(jxlOptions(settings({ format: 'jxl', quality: undefined, effort: undefined }))).toEqual({
      quality: 75,
      effort: 7,
    })
  })

  it('maps oxipng effort->level (default level 2)', () => {
    expect(oxipngOptions(settings({ format: 'oxipng', effort: 4 }))).toEqual({ level: 4 })
    expect(oxipngOptions(settings({ format: 'oxipng', effort: undefined }))).toEqual({ level: 2 })
  })
})

describe('codecApi surface', () => {
  it('exposes an async processImage function', () => {
    expect(typeof codecApi.processImage).toBe('function')
  })
})

describe('decodeToImageData fallback routing', () => {
  // jsdom has no createImageBitmap, so every call exercises the fallback path.
  beforeEach(() => {
    vi.mocked(jxlDecode).mockClear()
    vi.mocked(avifDecode).mockClear()
  })

  it('falls back to the JPEG XL decoder for image/jxl sources', async () => {
    const result = await decodeToImageData(new ArrayBuffer(4), 'image/jxl')
    expect(jxlDecode).toHaveBeenCalledTimes(1)
    expect(avifDecode).not.toHaveBeenCalled()
    expect(result.width).toBe(2)
  })

  it('falls back to the AVIF decoder for image/avif sources', async () => {
    const result = await decodeToImageData(new ArrayBuffer(4), 'image/avif')
    expect(avifDecode).toHaveBeenCalledTimes(1)
    expect(jxlDecode).not.toHaveBeenCalled()
    expect(result.width).toBe(3)
  })

  it('rethrows the original decode failure for other source types instead of trying AVIF', async () => {
    await expect(decodeToImageData(new ArrayBuffer(4), 'image/png')).rejects.toThrow()
    expect(jxlDecode).not.toHaveBeenCalled()
    expect(avifDecode).not.toHaveBeenCalled()
  })
})
