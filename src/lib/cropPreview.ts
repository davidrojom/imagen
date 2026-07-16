import type { CSSProperties } from 'react'
import type { CropRect } from '../types'
import type { Dimensions } from './resizeMath'

export interface CropPreviewStyles {
  frame: CSSProperties
  image: CSSProperties
}

// Frame sizing for a `position: relative; overflow: hidden` box whose shape is
// `frameWidth / frameHeight`. Given the aspect ratio of the box that contains
// it, pick the constraining axis explicitly: an explicit `width: 100%` lets
// `aspect-ratio` derive the height, but if `max-height` then clamps that height
// the width does NOT shrink to match — the frame collapses to the container's
// aspect and its inner image stretches. Driving from the axis that fits keeps
// both dimensions consistent with the intended aspect.
export function cropFrameStyle(
  frameWidth: number,
  frameHeight: number,
  containerAspect?: number,
): CSSProperties {
  const style: CSSProperties = { aspectRatio: `${frameWidth} / ${frameHeight}` }
  if (containerAspect != null) {
    if (frameWidth / frameHeight >= containerAspect) {
      // Frame is (at least) as wide as the container: constrain width, derive height.
      style.width = '100%'
    } else {
      // Frame is taller/narrower than the container: constrain height, derive width.
      style.height = '100%'
    }
  }
  return style
}

// The frame element must be `position: relative; overflow: hidden`. The image
// element is the full original, absolutely positioned so that exactly the crop
// region fills the frame. Pass `containerAspect` (the aspect ratio of the frame's
// container) to have the frame size itself along the constraining axis; omit it
// to emit the aspect ratio alone (height-driven layouts such as the filmstrip).
export function cropPreviewStyles(
  rect: CropRect,
  dims: Dimensions,
  containerAspect?: number,
): CropPreviewStyles {
  return {
    frame: cropFrameStyle(rect.width, rect.height, containerAspect),
    image: {
      position: 'absolute',
      maxWidth: 'none',
      maxHeight: 'none',
      width: `${(dims.width / rect.width) * 100}%`,
      height: `${(dims.height / rect.height) * 100}%`,
      left: `-${(rect.x / rect.width) * 100}%`,
      top: `-${(rect.y / rect.height) * 100}%`,
    },
  }
}
