import type { CropRatio, CropRect, CropSettings } from '../types'
import type { Dimensions } from './resizeMath'

export const MIN_CROP_PX = 16

export interface PercentRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropSpec {
  rect?: CropRect
  ratio?: { w: number; h: number }
}

export function ratioValue(ratio: CropRatio | undefined): number | undefined {
  return ratio?.kind === 'ratio' ? ratio.w / ratio.h : undefined
}

export function ratioLabel(ratio: CropRatio): string {
  if (ratio.kind === 'none') return 'None'
  if (ratio.kind === 'free') return 'Free'
  return `${ratio.w}:${ratio.h}`
}

export function centeredCrop(dims: Dimensions, ratio: { w: number; h: number }): CropRect {
  const target = ratio.w / ratio.h
  let width = dims.width
  let height = width / target
  if (height > dims.height) {
    height = dims.height
    width = height * target
  }
  const w = Math.min(dims.width, Math.max(1, Math.round(width)))
  const h = Math.min(dims.height, Math.max(1, Math.round(height)))
  return {
    x: Math.round((dims.width - w) / 2),
    y: Math.round((dims.height - h) / 2),
    width: w,
    height: h,
  }
}

export function clampRect(rect: CropRect, dims: Dimensions): CropRect {
  const minW = Math.min(MIN_CROP_PX, dims.width)
  const minH = Math.min(MIN_CROP_PX, dims.height)
  const width = Math.max(minW, Math.min(Math.round(rect.width), dims.width))
  const height = Math.max(minH, Math.min(Math.round(rect.height), dims.height))
  const x = Math.max(0, Math.min(Math.round(rect.x), dims.width - width))
  const y = Math.max(0, Math.min(Math.round(rect.y), dims.height - height))
  return { x, y, width, height }
}

export function isFullImage(rect: CropRect, dims: Dimensions): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === dims.width && rect.height === dims.height
}

export function effectiveRatio(crop: CropSettings | undefined, globalCrop: CropRatio): CropRatio {
  return crop?.ratio ?? globalCrop
}

export function effectiveCropRect(
  crop: CropSettings | undefined,
  globalCrop: CropRatio,
  dims: Dimensions,
): CropRect | undefined {
  if (crop?.rect) {
    const clamped = clampRect(crop.rect, dims)
    return isFullImage(clamped, dims) ? undefined : clamped
  }
  const ratio = effectiveRatio(crop, globalCrop)
  if (ratio.kind !== 'ratio') return undefined
  const centered = centeredCrop(dims, ratio)
  return isFullImage(centered, dims) ? undefined : centered
}

export function cropSnapshot(
  crop: CropSettings | undefined,
  globalCrop: CropRatio,
): CropSpec | undefined {
  if (crop?.rect) return { rect: crop.rect }
  const ratio = effectiveRatio(crop, globalCrop)
  if (ratio.kind === 'ratio') return { ratio: { w: ratio.w, h: ratio.h } }
  return undefined
}

export function resolveCropRect(dims: Dimensions, crop: CropSpec | undefined): CropRect | undefined {
  if (!crop) return undefined
  if (crop.rect) {
    const clamped = clampRect(crop.rect, dims)
    return isFullImage(clamped, dims) ? undefined : clamped
  }
  if (crop.ratio) {
    const centered = centeredCrop(dims, crop.ratio)
    return isFullImage(centered, dims) ? undefined : centered
  }
  return undefined
}

export function rectToPercent(rect: CropRect, dims: Dimensions): PercentRect {
  return {
    x: (rect.x / dims.width) * 100,
    y: (rect.y / dims.height) * 100,
    width: (rect.width / dims.width) * 100,
    height: (rect.height / dims.height) * 100,
  }
}

export function percentToRect(pct: PercentRect, dims: Dimensions): CropRect {
  return clampRect(
    {
      x: (pct.x / 100) * dims.width,
      y: (pct.y / 100) * dims.height,
      width: (pct.width / 100) * dims.width,
      height: (pct.height / 100) * dims.height,
    },
    dims,
  )
}
