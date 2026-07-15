import { describe, expect, it } from 'vitest'
import { cropImageData } from './cropImage'

// 4x3 image where pixel (x, y) has r = x, g = y, b = 42, a = 255
function makeImage(width = 4, height = 3): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x
      data[i + 1] = y
      data[i + 2] = 42
      data[i + 3] = 255
    }
  }
  return new ImageData(data, width, height)
}

function pixelAt(image: ImageData, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4
  return [...image.data.slice(i, i + 4)]
}

describe('cropImageData', () => {
  it('extracts the requested region with correct dimensions', () => {
    const out = cropImageData(makeImage(), { x: 1, y: 1, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
  })

  it('copies the right pixels (position-encoded)', () => {
    const out = cropImageData(makeImage(), { x: 1, y: 1, width: 2, height: 2 })
    expect(pixelAt(out, 0, 0)).toEqual([1, 1, 42, 255]) // source (1,1)
    expect(pixelAt(out, 1, 0)).toEqual([2, 1, 42, 255]) // source (2,1)
    expect(pixelAt(out, 0, 1)).toEqual([1, 2, 42, 255]) // source (1,2)
    expect(pixelAt(out, 1, 1)).toEqual([2, 2, 42, 255]) // source (2,2)
  })

  it('handles edge-touching crops', () => {
    const out = cropImageData(makeImage(), { x: 2, y: 0, width: 2, height: 3 })
    expect(pixelAt(out, 0, 0)).toEqual([2, 0, 42, 255])
    expect(pixelAt(out, 1, 2)).toEqual([3, 2, 42, 255])
  })
})
