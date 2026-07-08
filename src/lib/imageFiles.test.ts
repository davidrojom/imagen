import { describe, expect, it } from 'vitest'
import { isImageFile } from './imageFiles'

function makeFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('isImageFile', () => {
  it('accepts files with an image MIME type', () => {
    expect(isImageFile(makeFile('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isImageFile(makeFile('a.avif', 'image/avif'))).toBe(true)
    expect(isImageFile(makeFile('a.gif', 'image/gif'))).toBe(true)
  })

  it('accepts files by image extension when the MIME type is missing', () => {
    expect(isImageFile(makeFile('a.png', ''))).toBe(true)
    expect(isImageFile(makeFile('a.webp', ''))).toBe(true)
  })

  it('rejects non-image files', () => {
    expect(isImageFile(makeFile('notes.txt', 'text/plain'))).toBe(false)
    expect(isImageFile(makeFile('doc.pdf', 'application/pdf'))).toBe(false)
    expect(isImageFile(makeFile('archive', ''))).toBe(false)
  })
})
