import { describe, expect, it } from 'vitest'
import { imageTypeForFile, isImageFile } from './imageFiles'

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

describe('imageTypeForFile', () => {
  it('returns the browser-provided MIME type when present', () => {
    expect(imageTypeForFile(makeFile('a.jxl', 'image/jxl'))).toBe('image/jxl')
    expect(imageTypeForFile(makeFile('odd-name.png', 'image/webp'))).toBe('image/webp')
  })

  it('infers the MIME type from the extension when the browser leaves it empty', () => {
    expect(imageTypeForFile(makeFile('photo.jxl', ''))).toBe('image/jxl')
    expect(imageTypeForFile(makeFile('photo.avif', ''))).toBe('image/avif')
    expect(imageTypeForFile(makeFile('photo.JPG', ''))).toBe('image/jpeg')
    expect(imageTypeForFile(makeFile('photo.jpeg', ''))).toBe('image/jpeg')
    expect(imageTypeForFile(makeFile('photo.png', ''))).toBe('image/png')
    expect(imageTypeForFile(makeFile('photo.webp', ''))).toBe('image/webp')
  })

  it('returns an empty string for unknown extensions', () => {
    expect(imageTypeForFile(makeFile('archive', ''))).toBe('')
    expect(imageTypeForFile(makeFile('data.bin', ''))).toBe('')
  })
})
