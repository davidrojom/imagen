import { describe, expect, it } from 'vitest'
import {
  MIN_CROP_PX,
  centeredCrop,
  clampRect,
  cropSnapshot,
  effectiveCropRect,
  effectiveRatio,
  isFullImage,
  percentToRect,
  ratioLabel,
  ratioValue,
  rectToPercent,
  resolveCropRect,
} from './cropMath'
import type { CropRatio } from '../types'

const landscape = { width: 1600, height: 900 }
const portrait = { width: 900, height: 1600 }

const none: CropRatio = { kind: 'none' }
const free: CropRatio = { kind: 'free' }
const sixteenNine: CropRatio = { kind: 'ratio', w: 16, h: 9 }
const square: CropRatio = { kind: 'ratio', w: 1, h: 1 }

describe('ratioValue / ratioLabel', () => {
  it('returns w/h only for ratio kind', () => {
    expect(ratioValue(sixteenNine)).toBeCloseTo(16 / 9)
    expect(ratioValue(none)).toBeUndefined()
    expect(ratioValue(free)).toBeUndefined()
    expect(ratioValue(undefined)).toBeUndefined()
  })

  it('labels every kind', () => {
    expect(ratioLabel(none)).toBe('None')
    expect(ratioLabel(free)).toBe('Free')
    expect(ratioLabel(sixteenNine)).toBe('16:9')
  })
})

describe('centeredCrop', () => {
  it('returns the full image when the ratio matches exactly', () => {
    expect(centeredCrop(landscape, { w: 16, h: 9 })).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })

  it('pillarboxes a square crop of a landscape image', () => {
    expect(centeredCrop(landscape, { w: 1, h: 1 })).toEqual({ x: 350, y: 0, width: 900, height: 900 })
  })

  it('letterboxes a 16:9 crop of a portrait image (full-width band)', () => {
    const crop = centeredCrop(portrait, { w: 16, h: 9 })
    expect(crop.width).toBe(900)
    expect(crop.height).toBe(506)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(547)
  })

  it('never exceeds the image bounds after rounding', () => {
    const dims = { width: 3, height: 5 }
    const crop = centeredCrop(dims, { w: 16, h: 9 })
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(dims.width)
    expect(crop.y + crop.height).toBeLessThanOrEqual(dims.height)
  })

  it('enforces the minimum crop size even when the ratio would make a side smaller', () => {
    expect(centeredCrop({ width: 20, height: 20 }, { w: 16, h: 9 })).toEqual({
      x: 0,
      y: 2,
      width: 20,
      height: 16,
    })
  })
})

describe('clampRect', () => {
  it('passes through an in-bounds rect, rounding to integers', () => {
    expect(clampRect({ x: 10.4, y: 20.6, width: 100.2, height: 50.5 }, landscape)).toEqual({
      x: 10,
      y: 21,
      width: 100,
      height: 51,
    })
  })

  it('clamps a rect that overflows right/bottom by moving it back in bounds', () => {
    expect(clampRect({ x: 1550, y: 850, width: 100, height: 100 }, landscape)).toEqual({
      x: 1500,
      y: 800,
      width: 100,
      height: 100,
    })
  })

  it('clamps negative origins to zero', () => {
    expect(clampRect({ x: -5, y: -5, width: 100, height: 100 }, landscape)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it(`enforces the ${MIN_CROP_PX}px minimum side`, () => {
    const clamped = clampRect({ x: 0, y: 0, width: 2, height: 2 }, landscape)
    expect(clamped.width).toBe(MIN_CROP_PX)
    expect(clamped.height).toBe(MIN_CROP_PX)
  })

  it('caps the minimum at the image size for tiny images', () => {
    const clamped = clampRect({ x: 0, y: 0, width: 1, height: 1 }, { width: 8, height: 8 })
    expect(clamped).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('shrinks an oversized rect to the image', () => {
    expect(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, landscape)).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 900,
    })
  })
})

describe('isFullImage', () => {
  it('detects the identity crop', () => {
    expect(isFullImage({ x: 0, y: 0, width: 1600, height: 900 }, landscape)).toBe(true)
    expect(isFullImage({ x: 0, y: 0, width: 1599, height: 900 }, landscape)).toBe(false)
    expect(isFullImage({ x: 1, y: 0, width: 1599, height: 900 }, landscape)).toBe(false)
  })
})

describe('effectiveRatio', () => {
  it('prefers the per-image override', () => {
    expect(effectiveRatio({ ratio: square }, sixteenNine)).toEqual(square)
  })

  it('falls back to the batch ratio', () => {
    expect(effectiveRatio(undefined, sixteenNine)).toEqual(sixteenNine)
    expect(effectiveRatio({ rect: { x: 0, y: 0, width: 10, height: 10 } }, free)).toEqual(free)
  })
})

describe('effectiveCropRect', () => {
  it('returns undefined when nothing crops', () => {
    expect(effectiveCropRect(undefined, none, landscape)).toBeUndefined()
    expect(effectiveCropRect(undefined, free, landscape)).toBeUndefined()
  })

  it('uses a manual rect, clamped', () => {
    expect(
      effectiveCropRect({ rect: { x: -10, y: 0, width: 200, height: 100 } }, none, landscape),
    ).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('auto-centers from the batch ratio', () => {
    expect(effectiveCropRect(undefined, square, landscape)).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    })
  })

  it('per-image none beats a batch ratio', () => {
    expect(effectiveCropRect({ ratio: none }, square, landscape)).toBeUndefined()
  })

  it('treats a full-image manual rect as no crop', () => {
    expect(
      effectiveCropRect({ rect: { x: 0, y: 0, width: 1600, height: 900 } }, none, landscape),
    ).toBeUndefined()
  })

  it('treats a ratio matching the image as no crop', () => {
    expect(effectiveCropRect(undefined, sixteenNine, landscape)).toBeUndefined()
  })
})

describe('cropSnapshot', () => {
  it('is undefined for none/free without a manual rect', () => {
    expect(cropSnapshot(undefined, none)).toBeUndefined()
    expect(cropSnapshot(undefined, free)).toBeUndefined()
  })

  it('sends the manual rect when present', () => {
    const rect = { x: 1, y: 2, width: 30, height: 40 }
    expect(cropSnapshot({ rect }, sixteenNine)).toEqual({ rect })
  })

  it('sends the effective ratio for auto crops (worker computes the rect)', () => {
    expect(cropSnapshot(undefined, sixteenNine)).toEqual({ ratio: { w: 16, h: 9 } })
    expect(cropSnapshot({ ratio: square }, sixteenNine)).toEqual({ ratio: { w: 1, h: 1 } })
  })

  it('per-image none yields undefined even with a batch ratio', () => {
    expect(cropSnapshot({ ratio: none }, sixteenNine)).toBeUndefined()
  })
})

describe('resolveCropRect (worker side)', () => {
  it('returns undefined without a crop spec', () => {
    expect(resolveCropRect(landscape, undefined)).toBeUndefined()
  })

  it('clamps a provided rect and drops full-image rects', () => {
    expect(resolveCropRect(landscape, { rect: { x: 0, y: 0, width: 9999, height: 9999 } })).toBeUndefined()
    expect(resolveCropRect(landscape, { rect: { x: 100, y: 100, width: 200, height: 200 } })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    })
  })

  it('computes a centered crop from a ratio and drops no-op ratios', () => {
    expect(resolveCropRect(landscape, { ratio: { w: 1, h: 1 } })).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    })
    expect(resolveCropRect(landscape, { ratio: { w: 16, h: 9 } })).toBeUndefined()
  })
})

describe('percent conversions', () => {
  it('round-trips a rect through percent space', () => {
    const rect = { x: 400, y: 225, width: 800, height: 450 }
    const pct = rectToPercent(rect, landscape)
    expect(pct).toEqual({ x: 25, y: 25, width: 50, height: 50 })
    expect(percentToRect(pct, landscape)).toEqual(rect)
  })

  it('percentToRect clamps out-of-range values', () => {
    expect(percentToRect({ x: 99, y: 99, width: 50, height: 50 }, landscape)).toEqual({
      x: 800,
      y: 450,
      width: 800,
      height: 450,
    })
  })
})
