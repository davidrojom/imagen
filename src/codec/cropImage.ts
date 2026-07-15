import type { CropRect } from '../types'

export function cropImageData(image: ImageData, rect: CropRect): ImageData {
  const { x, y, width, height } = rect
  const out = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const srcStart = ((y + row) * image.width + x) * 4
    out.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4)
  }
  return new ImageData(out, width, height)
}
