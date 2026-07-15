import type { CSSProperties } from 'react'
import type { CropRect } from '../types'
import type { Dimensions } from './resizeMath'

export interface CropPreviewStyles {
  frame: CSSProperties
  image: CSSProperties
}

// The frame element must be `position: relative; overflow: hidden`. The image
// element is the full original, absolutely positioned so that exactly the crop
// region fills the frame.
export function cropPreviewStyles(rect: CropRect, dims: Dimensions): CropPreviewStyles {
  return {
    frame: { aspectRatio: `${rect.width} / ${rect.height}` },
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
