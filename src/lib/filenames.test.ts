import { describe, expect, it } from 'vitest'
import { dedupeFilename, outputFilename, replaceExtension, uniqueOutputName } from './filenames'

describe('replaceExtension', () => {
  it('replaces the last extension', () => {
    expect(replaceExtension('photo.jpg', 'webp')).toBe('photo.webp')
    expect(replaceExtension('image.PNG', 'avif')).toBe('image.avif')
  })

  it('appends an extension when there is none', () => {
    expect(replaceExtension('photo', 'webp')).toBe('photo.webp')
  })

  it('only replaces the final extension for multi-dot names', () => {
    expect(replaceExtension('archive.tar.gz', 'webp')).toBe('archive.tar.webp')
  })
})

describe('outputFilename', () => {
  it('maps the source name to the output format extension', () => {
    expect(outputFilename('photo.jpg', 'webp')).toBe('photo.webp')
    expect(outputFilename('photo.jpg', 'mozjpeg')).toBe('photo.jpg')
    expect(outputFilename('shot.heic', 'oxipng')).toBe('shot.png')
  })
})

describe('dedupeFilename', () => {
  it('returns the name unchanged when there is no collision', () => {
    expect(dedupeFilename('photo.webp', [])).toBe('photo.webp')
  })

  it('appends an incrementing suffix on collision', () => {
    expect(dedupeFilename('photo.webp', ['photo.webp'])).toBe('photo-1.webp')
    expect(dedupeFilename('photo.webp', ['photo.webp', 'photo-1.webp'])).toBe('photo-2.webp')
  })

  it('works with a Set of existing names', () => {
    expect(dedupeFilename('photo.webp', new Set(['photo.webp']))).toBe('photo-1.webp')
  })
})

describe('uniqueOutputName', () => {
  it('maps extension and de-duplicates in one step', () => {
    expect(uniqueOutputName('photo.jpg', 'webp', ['photo.webp'])).toBe('photo-1.webp')
  })
})
