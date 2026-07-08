// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildZipBlob, collectZipEntries, zipImages, ZIP_FILENAME } from './zip'
import type { ImageItem, ImageResult, OutputFormat } from '../types'

function makeResult(overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }),
    url: 'blob:result',
    outputType: 'image/webp',
    outputBytes: 4,
    width: 10,
    height: 10,
    outputName: 'photo.webp',
    ...overrides,
  }
}

function makeItem(overrides: Partial<ImageItem> = {}): ImageItem {
  return {
    id: overrides.id ?? 'id',
    file: new File(['x'], overrides.name ?? 'photo.jpg', { type: 'image/jpeg' }),
    name: overrides.name ?? 'photo.jpg',
    sourceType: 'image/jpeg',
    originalBytes: 100,
    previewUrl: 'blob:preview',
    settings: null,
    status: 'done',
    result: makeResult(),
    ...overrides,
  }
}

function localHeaderCount(bytes: Uint8Array): number {
  let count = 0
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      count++
    }
  }
  return count
}

async function blobText(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  return new TextDecoder('latin1').decode(new Uint8Array(buf))
}

describe('collectZipEntries', () => {
  it('includes only done items that have a result', () => {
    const items: ImageItem[] = [
      makeItem({ id: 'a', name: 'a.jpg', result: makeResult({ outputName: 'a.webp' }) }),
      makeItem({ id: 'b', status: 'queued', result: undefined }),
      makeItem({ id: 'c', status: 'processing', result: undefined }),
      makeItem({ id: 'd', status: 'error', result: undefined, error: 'boom' }),
      makeItem({ id: 'e', name: 'e.jpg', result: makeResult({ outputName: 'e.webp' }) }),
    ]
    const entries = collectZipEntries(items)
    expect(entries.map((entry) => entry.name)).toEqual(['a.webp', 'e.webp'])
  })

  it('preserves grid order', () => {
    const items: ImageItem[] = [
      makeItem({ id: '1', result: makeResult({ outputName: 'first.webp' }) }),
      makeItem({ id: '2', result: makeResult({ outputName: 'second.webp' }) }),
      makeItem({ id: '3', result: makeResult({ outputName: 'third.webp' }) }),
    ]
    expect(collectZipEntries(items).map((entry) => entry.name)).toEqual([
      'first.webp',
      'second.webp',
      'third.webp',
    ])
  })

  it('de-duplicates colliding output names', () => {
    const items: ImageItem[] = [
      makeItem({ id: '1', result: makeResult({ outputName: 'photo.webp' }) }),
      makeItem({ id: '2', result: makeResult({ outputName: 'photo.webp' }) }),
      makeItem({ id: '3', result: makeResult({ outputName: 'photo.webp' }) }),
    ]
    expect(collectZipEntries(items).map((entry) => entry.name)).toEqual([
      'photo.webp',
      'photo-1.webp',
      'photo-2.webp',
    ])
  })

  it('keeps mixed extensions from mixed output formats', () => {
    const items: ImageItem[] = [
      makeItem({ id: '1', result: makeResult({ outputName: 'a.webp', outputType: 'image/webp' }) }),
      makeItem({ id: '2', result: makeResult({ outputName: 'b.avif', outputType: 'image/avif' }) }),
      makeItem({ id: '3', result: makeResult({ outputName: 'c.png', outputType: 'image/png' }) }),
    ]
    expect(collectZipEntries(items).map((entry) => entry.name)).toEqual(['a.webp', 'b.avif', 'c.png'])
  })

  it('returns nothing when no item is done', () => {
    const items: ImageItem[] = [
      makeItem({ id: '1', status: 'queued', result: undefined }),
      makeItem({ id: '2', status: 'error', result: undefined }),
    ]
    expect(collectZipEntries(items)).toEqual([])
  })
})

describe('buildZipBlob', () => {
  it('produces a ZIP blob with one local header per entry', async () => {
    const blob = await buildZipBlob([
      { name: 'a.webp', blob: new Blob([new Uint8Array([1, 2, 3])]) },
      { name: 'b.avif', blob: new Blob([new Uint8Array([4, 5, 6, 7])]) },
    ])
    expect(blob).toBeInstanceOf(Blob)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(localHeaderCount(bytes)).toBe(2)
    const text = await blobText(blob)
    expect(text).toContain('a.webp')
    expect(text).toContain('b.avif')
  })

  it('returns an empty (no-entry) archive when given no entries', async () => {
    const blob = await buildZipBlob([])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(localHeaderCount(bytes)).toBe(0)
  })
})

describe('zipImages', () => {
  it('assembles a ZIP from done items with one entry each, excluding non-done', async () => {
    const formats: Array<[string, OutputFormat, string]> = [
      ['one.webp', 'webp', 'image/webp'],
      ['two.avif', 'avif', 'image/avif'],
    ]
    const items: ImageItem[] = [
      ...formats.map(([name, , mime], i) =>
        makeItem({ id: `d${i}`, result: makeResult({ outputName: name, outputType: mime }) }),
      ),
      makeItem({ id: 'q', status: 'queued', result: undefined }),
    ]
    const blob = await zipImages(items)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(localHeaderCount(bytes)).toBe(2)
    const text = await blobText(blob)
    expect(text).toContain('one.webp')
    expect(text).toContain('two.avif')
  })
})

describe('ZIP_FILENAME', () => {
  it('is the canonical export filename', () => {
    expect(ZIP_FILENAME).toBe('imagen-export.zip')
  })
})
