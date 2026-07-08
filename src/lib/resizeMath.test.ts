import { describe, expect, it } from 'vitest'
import { computeTargetDimensions } from './resizeMath'
import type { ResizeSettings } from '../types'

const original = { width: 800, height: 600 }

describe('computeTargetDimensions', () => {
  it('returns the original dimensions for mode "none"', () => {
    expect(computeTargetDimensions(original, { mode: 'none' })).toEqual({ width: 800, height: 600 })
  })

  it('scales by percentage', () => {
    expect(computeTargetDimensions(original, { mode: 'percentage', percentage: 50 })).toEqual({
      width: 400,
      height: 300,
    })
    expect(computeTargetDimensions(original, { mode: 'percentage', percentage: 25 })).toEqual({
      width: 200,
      height: 150,
    })
  })

  it('keeps aspect ratio when only width is given', () => {
    expect(computeTargetDimensions(original, { mode: 'dimensions', width: 400, keepAspect: true })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('keeps aspect ratio when only height is given', () => {
    expect(computeTargetDimensions(original, { mode: 'dimensions', height: 300, keepAspect: true })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('fits inside the box when both dimensions are given with keepAspect', () => {
    expect(
      computeTargetDimensions(original, { mode: 'dimensions', width: 400, height: 400, keepAspect: true }),
    ).toEqual({ width: 400, height: 300 })
  })

  it('stretches to exact dimensions when keepAspect is false', () => {
    expect(
      computeTargetDimensions(original, { mode: 'dimensions', width: 400, height: 400, keepAspect: false }),
    ).toEqual({ width: 400, height: 400 })
  })

  it('defaults to keepAspect true when unspecified in dimensions mode', () => {
    expect(computeTargetDimensions(original, { mode: 'dimensions', width: 400 })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('returns the original dimensions when no target is provided in dimensions mode', () => {
    expect(computeTargetDimensions(original, { mode: 'dimensions' } as ResizeSettings)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('never returns a dimension below 1 pixel', () => {
    expect(computeTargetDimensions({ width: 10, height: 10 }, { mode: 'percentage', percentage: 1 })).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('clamps percentage 0 to a valid >=1px result instead of 0', () => {
    const result = computeTargetDimensions(original, { mode: 'percentage', percentage: 0 })
    expect(result.width).toBeGreaterThanOrEqual(1)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })

  it('never yields 0/NaN/negative for invalid percentage input', () => {
    for (const percentage of [Number.NaN, -50]) {
      const result = computeTargetDimensions(original, { mode: 'percentage', percentage })
      expect(Number.isFinite(result.width)).toBe(true)
      expect(Number.isFinite(result.height)).toBe(true)
      expect(result.width).toBeGreaterThanOrEqual(1)
      expect(result.height).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps percentage 100 at the original dimensions', () => {
    expect(computeTargetDimensions(original, { mode: 'percentage', percentage: 100 })).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('treats an empty/0/NaN width in dimensions mode as not provided', () => {
    for (const width of [0, Number.NaN, -100] as number[]) {
      expect(computeTargetDimensions(original, { mode: 'dimensions', width, keepAspect: true })).toEqual({
        width: 800,
        height: 600,
      })
    }
  })

  it('falls back to the other dimension when one is invalid (keep-aspect)', () => {
    expect(
      computeTargetDimensions(original, { mode: 'dimensions', width: Number.NaN, height: 300, keepAspect: true }),
    ).toEqual({ width: 400, height: 300 })
  })

  it('never yields 0/NaN/negative for invalid dimensions with keep-aspect off', () => {
    const result = computeTargetDimensions(original, {
      mode: 'dimensions',
      width: Number.NaN,
      height: 0,
      keepAspect: false,
    })
    expect(result.width).toBeGreaterThanOrEqual(1)
    expect(result.height).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(result.width)).toBe(true)
    expect(Number.isFinite(result.height)).toBe(true)
  })
})
