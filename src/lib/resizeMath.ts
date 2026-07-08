import type { ResizeSettings } from '../types'

export interface Dimensions {
  width: number
  height: number
}

function toPixels(value: number): number {
  return Math.max(1, Math.round(value))
}

export function computeTargetDimensions(original: Dimensions, resize: ResizeSettings): Dimensions {
  const { width: ow, height: oh } = original

  switch (resize.mode) {
    case 'percentage': {
      const factor = (resize.percentage ?? 100) / 100
      return { width: toPixels(ow * factor), height: toPixels(oh * factor) }
    }

    case 'dimensions': {
      const keepAspect = resize.keepAspect ?? true
      const targetWidth = resize.width
      const targetHeight = resize.height

      if (targetWidth == null && targetHeight == null) {
        return { width: ow, height: oh }
      }

      if (!keepAspect) {
        return { width: toPixels(targetWidth ?? ow), height: toPixels(targetHeight ?? oh) }
      }

      if (targetWidth != null && targetHeight != null) {
        const scale = Math.min(targetWidth / ow, targetHeight / oh)
        return { width: toPixels(ow * scale), height: toPixels(oh * scale) }
      }

      if (targetWidth != null) {
        return { width: toPixels(targetWidth), height: toPixels(oh * (targetWidth / ow)) }
      }

      const scale = targetHeight! / oh
      return { width: toPixels(ow * scale), height: toPixels(targetHeight!) }
    }

    case 'none':
    default:
      return { width: ow, height: oh }
  }
}
