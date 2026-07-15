import { describe, expect, it } from 'vitest'
import { cropPreviewStyles } from './cropPreview'

describe('cropPreviewStyles', () => {
  it('sizes the frame to the crop aspect ratio', () => {
    const { frame } = cropPreviewStyles({ x: 350, y: 0, width: 900, height: 900 }, { width: 1600, height: 900 })
    expect(frame.aspectRatio).toBe('900 / 900')
  })

  it('scales and offsets the image so the crop region fills the frame', () => {
    // crop the exact center quarter of a 400x200 image
    const { image } = cropPreviewStyles({ x: 100, y: 50, width: 200, height: 100 }, { width: 400, height: 200 })
    expect(image.width).toBe('200%')
    expect(image.height).toBe('200%')
    expect(image.left).toBe('-50%')
    expect(image.top).toBe('-50%')
    expect(image.position).toBe('absolute')
    expect(image.maxWidth).toBe('none')
    expect(image.maxHeight).toBe('none')
  })

  it('uses zero offsets for an origin crop', () => {
    const { image } = cropPreviewStyles({ x: 0, y: 0, width: 100, height: 100 }, { width: 200, height: 200 })
    expect(image.left).toBe('-0%')
    expect(image.top).toBe('-0%')
  })
})
