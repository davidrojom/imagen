import { computeTargetDimensions } from '../lib/resizeMath'
import type { ResizeSettings } from '../types'

export interface ResizeExample {
  width: number
  height: number
  name?: string
}

function describeResize(resize: ResizeSettings): string | null {
  if (resize.mode === 'percentage') {
    const pct = resize.percentage
    if (pct == null) return 'Set a scale percentage to enable resizing.'
    if (pct >= 100) return 'At 100%, images keep their original dimensions.'
    return `Every image is scaled to ${pct}% of its original size, keeping proportions.`
  }

  if (resize.mode === 'dimensions') {
    const keepAspect = resize.keepAspect ?? true
    const { width, height } = resize
    if (width == null && height == null) {
      return 'Set a width and/or height to enable resizing.'
    }
    if (!keepAspect) {
      if (width != null && height != null) {
        return `Every image is stretched to exactly ${width} × ${height} px — proportions are not preserved.`
      }
      if (width != null) {
        return `Every width is forced to ${width} px while heights stay unchanged — proportions are not preserved.`
      }
      return `Every height is forced to ${height} px while widths stay unchanged — proportions are not preserved.`
    }
    if (width != null && height != null) {
      return `Every image is scaled — up or down — to fit exactly within ${width} × ${height} px, keeping proportions.`
    }
    if (width != null) {
      return `Every image is scaled — up or down — to exactly ${width} px wide, keeping proportions.`
    }
    return `Every image is scaled — up or down — to exactly ${height} px tall, keeping proportions.`
  }

  return null
}

export default function ResizeHint({
  resize,
  example,
}: {
  resize: ResizeSettings
  example?: ResizeExample | null
}) {
  const description = describeResize(resize)
  if (!description) return null

  const target = example ? computeTargetDimensions(example, resize) : null
  const changed =
    example != null &&
    target != null &&
    (target.width !== example.width || target.height !== example.height)

  return (
    <p
      data-testid="resize-hint"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-relaxed text-ink-faint"
    >
      <span>{description}</span>
      {changed ? (
        <span data-testid="resize-preview" className="font-mono text-[11px] text-ink-dim">
          {example.name ? `${example.name}: ` : ''}
          {example.width} × {example.height} → {target.width} × {target.height} px
        </span>
      ) : null}
    </p>
  )
}
