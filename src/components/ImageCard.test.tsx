import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImageCard from './ImageCard'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { ImageItem } from '../types'

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
}

function seedItem(overrides: Partial<ImageItem> = {}): ImageItem {
  const item: ImageItem = {
    id: 'id-1',
    file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    name: 'photo.jpg',
    sourceType: 'image/jpeg',
    originalBytes: 2048,
    originalWidth: 800,
    originalHeight: 600,
    previewUrl: 'blob:preview-1',
    settings: null,
    status: 'queued',
    ...overrides,
  }
  useImagenStore.setState({ images: [item] })
  return item
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('ImageCard', () => {
  it('renders a thumbnail from the object URL with the filename as alt text', () => {
    const item = seedItem()
    render(<ImageCard item={item} />)
    const thumb = screen.getByTestId('thumbnail') as HTMLImageElement
    expect(thumb.getAttribute('src')).toBe('blob:preview-1')
    expect(thumb).toHaveAttribute('alt', 'photo.jpg')
  })

  it('displays filename, original dimensions, original size and a status badge', () => {
    const item = seedItem({ originalBytes: 2048, originalWidth: 800, originalHeight: 600 })
    render(<ImageCard item={item} />)
    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    expect(screen.getByText(/800\s*[×x]\s*600/)).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent(/queued/i)
  })

  it('records the natural dimensions on image load when unknown', () => {
    const item = seedItem({ originalWidth: undefined, originalHeight: undefined })
    render(<ImageCard item={item} />)
    const thumb = screen.getByTestId('thumbnail') as HTMLImageElement
    Object.defineProperty(thumb, 'naturalWidth', { value: 1234, configurable: true })
    Object.defineProperty(thumb, 'naturalHeight', { value: 567, configurable: true })
    fireEvent.load(thumb)
    const stored = useImagenStore.getState().images[0]
    expect(stored.originalWidth).toBe(1234)
    expect(stored.originalHeight).toBe(567)
  })

  it('removes exactly this item when its remove control is activated', () => {
    const a = seedItem({ id: 'a', name: 'a.jpg' })
    useImagenStore.setState({
      images: [a, { ...a, id: 'b', name: 'b.jpg', previewUrl: 'blob:b' }],
    })
    const item = useImagenStore.getState().images[0]
    const { container } = render(<ImageCard item={item} />)
    fireEvent.click(within(container).getByRole('button', { name: /remove/i }))
    expect(useImagenStore.getState().images.map((i) => i.name)).toEqual(['b.jpg'])
  })

  it('shows output size and a positive savings for a shrinking result when done', () => {
    const item = seedItem({
      status: 'done',
      originalBytes: 2048,
      result: {
        blob: new Blob(['out']),
        url: 'blob:out',
        outputType: 'image/webp',
        outputBytes: 512,
        width: 800,
        height: 600,
        outputName: 'photo.webp',
      },
    })
    render(<ImageCard item={item} />)
    const outputSize = screen.getByTestId('output-size')
    expect(outputSize).toHaveTextContent('512 B')
    const savings = screen.getByTestId('savings')
    expect(Number(savings.getAttribute('data-savings'))).toBeGreaterThan(0)
    expect(savings).toHaveTextContent('75')
  })

  it('does not show misleading positive savings when the output did not shrink', () => {
    const item = seedItem({
      status: 'done',
      originalBytes: 110,
      result: {
        blob: new Blob(['out']),
        url: 'blob:out',
        outputType: 'image/webp',
        outputBytes: 400,
        width: 8,
        height: 8,
        outputName: 'photo.webp',
      },
    })
    render(<ImageCard item={item} />)
    const savings = screen.getByTestId('savings')
    expect(Number(savings.getAttribute('data-savings'))).toBeLessThanOrEqual(0)
    expect(savings).not.toHaveTextContent(/^\s*75%/)
    expect(screen.getByTestId('output-size')).toHaveTextContent('400 B')
  })

  it('does not show output size or savings before the item is done', () => {
    const item = seedItem({ status: 'queued' })
    render(<ImageCard item={item} />)
    expect(screen.queryByTestId('output-size')).not.toBeInTheDocument()
    expect(screen.queryByTestId('savings')).not.toBeInTheDocument()
  })

  it('exposes a per-item download control pointing at the object URL with the output filename', () => {
    const item = seedItem({
      status: 'done',
      result: {
        blob: new Blob(['out']),
        url: 'blob:out-1',
        outputType: 'image/webp',
        outputBytes: 512,
        width: 800,
        height: 600,
        outputName: 'photo.webp',
      },
    })
    render(<ImageCard item={item} />)
    const download = screen.getByTestId('download-link')
    expect(download).toHaveAttribute('href', 'blob:out-1')
    expect(download).toHaveAttribute('download', 'photo.webp')
  })

  it('does not render a download control while the item is queued or processing', () => {
    const queued = seedItem({ status: 'queued' })
    const { rerender } = render(<ImageCard item={queued} />)
    expect(screen.queryByTestId('download-link')).not.toBeInTheDocument()

    rerender(<ImageCard item={{ ...queued, status: 'processing' }} />)
    expect(screen.queryByTestId('download-link')).not.toBeInTheDocument()
  })

  it('does not render a download control for an errored item', () => {
    const item = seedItem({ status: 'error', error: 'decode failed' })
    render(<ImageCard item={item} />)
    expect(screen.queryByTestId('download-link')).not.toBeInTheDocument()
  })
})
