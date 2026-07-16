import { describe, expect, it } from 'vitest'
import { cropFrameStyle, cropPreviewStyles } from './cropPreview'

describe('cropPreviewStyles', () => {
  it('sizes the frame to the crop aspect ratio', () => {
    const { frame } = cropPreviewStyles({ x: 350, y: 0, width: 900, height: 900 }, { width: 1600, height: 900 })
    expect(frame.aspectRatio).toBe('900 / 900')
  })

  it('emits no sizing keys when no container aspect is given (filmstrip stays height-driven)', () => {
    const { frame } = cropPreviewStyles({ x: 0, y: 0, width: 900, height: 900 }, { width: 1600, height: 900 })
    expect(frame.aspectRatio).toBe('900 / 900')
    expect(frame.width).toBeUndefined()
    expect(frame.height).toBeUndefined()
  })

  it('drives a taller-than-container crop by height (1:1 crop in a 4/3 container)', () => {
    const { frame } = cropPreviewStyles(
      { x: 0, y: 0, width: 900, height: 900 },
      { width: 1600, height: 900 },
      4 / 3,
    )
    expect(frame.aspectRatio).toBe('900 / 900')
    expect(frame.height).toBe('100%')
    expect(frame.width).toBeUndefined()
  })

  it('drives a wider-than-container crop by width (16:9 crop in a 4/3 container)', () => {
    const { frame } = cropPreviewStyles(
      { x: 0, y: 0, width: 1600, height: 900 },
      { width: 1600, height: 900 },
      4 / 3,
    )
    expect(frame.aspectRatio).toBe('1600 / 900')
    expect(frame.width).toBe('100%')
    expect(frame.height).toBeUndefined()
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

describe('cropFrameStyle', () => {
  it('carries only the aspect ratio without a container aspect', () => {
    const style = cropFrameStyle(900, 900)
    expect(style.aspectRatio).toBe('900 / 900')
    expect(style.width).toBeUndefined()
    expect(style.height).toBeUndefined()
  })

  it('drives by height when the frame is narrower than the container', () => {
    const style = cropFrameStyle(900, 1600, 16 / 9)
    expect(style.aspectRatio).toBe('900 / 1600')
    expect(style.height).toBe('100%')
    expect(style.width).toBeUndefined()
  })

  it('drives by width when the frame is at least as wide as the container', () => {
    const style = cropFrameStyle(1600, 900, 16 / 9)
    expect(style.aspectRatio).toBe('1600 / 900')
    expect(style.width).toBe('100%')
    expect(style.height).toBeUndefined()
  })
})
