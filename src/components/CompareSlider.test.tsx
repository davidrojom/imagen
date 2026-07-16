import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompareSlider from './CompareSlider'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { ImageItem, ImageResult } from '../types'

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
}

function makeResult(overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    blob: new Blob(['out']),
    url: 'blob:optimized-1',
    outputType: 'image/webp',
    outputBytes: 512,
    width: 800,
    height: 600,
    outputName: 'photo.webp',
    ...overrides,
  }
}

function seedDone(overrides: Partial<ImageItem> = {}): ImageItem {
  const item: ImageItem = {
    id: 'id-1',
    file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    name: 'photo.jpg',
    sourceType: 'image/jpeg',
    originalBytes: 2048,
    originalWidth: 1600,
    originalHeight: 1200,
    previewUrl: 'blob:original-1',
    settings: null,
    status: 'done',
    result: makeResult(),
    ...overrides,
  }
  useImagenStore.setState({ images: [item], selectedId: item.id })
  return item
}

// Mirrors seedDone's convention (setting store state directly) while
// matching the shape the crop-alignment tests want to seed with.
function seedDoneImage({
  originalWidth,
  originalHeight,
  result,
}: {
  originalWidth: number
  originalHeight: number
  result: { width: number; height: number; cropRect?: { x: number; y: number; width: number; height: number } }
}): void {
  seedDone({
    originalWidth,
    originalHeight,
    result: makeResult(result),
  })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('CompareSlider', () => {
  it('renders nothing when no image is selected', () => {
    render(<CompareSlider />)
    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()
  })

  it('renders nothing when the selected image is not done', () => {
    seedDone({ status: 'processing', result: undefined })
    render(<CompareSlider />)
    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()
  })

  it('shows both the original and optimized images for a previewable output', () => {
    seedDone()
    render(<CompareSlider />)
    expect(screen.getByTestId('compare-view')).toBeInTheDocument()
    const original = screen.getByTestId('compare-original') as HTMLImageElement
    const optimized = screen.getByTestId('compare-optimized') as HTMLImageElement
    expect(original.getAttribute('src')).toBe('blob:original-1')
    expect(optimized.getAttribute('src')).toBe('blob:optimized-1')
    expect(screen.queryByTestId('compare-preview-unavailable')).not.toBeInTheDocument()
  })

  it('shows original and optimized sizes matching the grid values', () => {
    seedDone({ originalBytes: 2048, result: makeResult({ outputBytes: 512 }) })
    render(<CompareSlider />)
    const original = screen.getByTestId('compare-original-size')
    const optimized = screen.getByTestId('compare-optimized-size')
    expect(original).toHaveTextContent('2 KB')
    expect(optimized).toHaveTextContent('512 B')
    expect(original.textContent).not.toBe(optimized.textContent)
  })

  it('moves the divider and changes the reveal when the slider is dragged', () => {
    seedDone()
    render(<CompareSlider />)
    const slider = screen.getByTestId('compare-slider') as HTMLInputElement
    const divider = screen.getByTestId('compare-divider')
    const clip = screen.getByTestId('compare-original-clip')

    fireEvent.change(slider, { target: { value: '0' } })
    const leftPosition = divider.getAttribute('data-position')
    const leftReveal = clip.getAttribute('data-reveal')

    fireEvent.change(slider, { target: { value: '100' } })
    const rightPosition = divider.getAttribute('data-position')
    const rightReveal = clip.getAttribute('data-reveal')

    expect(leftPosition).not.toBe(rightPosition)
    expect(leftReveal).not.toBe(rightReveal)
    expect(clip.style.clipPath).toContain('inset(')
  })

  it('shows a graceful preview-not-available fallback for JPEG XL output without a broken image', () => {
    seedDone({
      result: makeResult({ outputType: 'image/jxl', outputName: 'photo.jxl', outputBytes: 640 }),
    })
    render(<CompareSlider />)
    expect(screen.getByTestId('compare-preview-unavailable')).toHaveTextContent(/preview not available/i)
    expect(screen.getByTestId('compare-preview-unavailable')).toHaveTextContent(/jpeg xl/i)
    expect(screen.queryByTestId('compare-optimized')).not.toBeInTheDocument()
    // still renders both size labels
    expect(screen.getByTestId('compare-original-size')).toBeInTheDocument()
    expect(screen.getByTestId('compare-optimized-size')).toHaveTextContent('640 B')
    // original side still renders
    expect(screen.getByTestId('compare-original')).toBeInTheDocument()
  })

  it('closes the compare view when the close control is activated', () => {
    seedDone()
    render(<CompareSlider />)
    fireEvent.click(screen.getByTestId('compare-close'))
    expect(useImagenStore.getState().selectedId).toBeNull()
    expect(screen.queryByTestId('compare-view')).not.toBeInTheDocument()
  })

  it('switches the compared subject when a different done image is selected', () => {
    const a = seedDone()
    const b: ImageItem = {
      ...a,
      id: 'id-2',
      name: 'other.png',
      previewUrl: 'blob:original-2',
      originalBytes: 4096,
      result: makeResult({ url: 'blob:optimized-2', outputBytes: 1024, outputName: 'other.webp' }),
    }
    useImagenStore.setState({ images: [a, b] })
    const { rerender } = render(<CompareSlider />)
    expect(screen.getByTestId('compare-filename')).toHaveTextContent('photo.jpg')

    act(() => {
      useImagenStore.getState().select('id-2')
    })
    rerender(<CompareSlider />)
    expect(screen.getByTestId('compare-filename')).toHaveTextContent('other.png')
    expect((screen.getByTestId('compare-optimized') as HTMLImageElement).src).toContain('blob:optimized-2')
    expect(screen.getByTestId('compare-optimized-size')).toHaveTextContent('1 KB')
  })

  it('reflects the latest result after re-optimization (no stale size)', () => {
    const item = seedDone({ result: makeResult({ outputBytes: 900 }) })
    const { rerender } = render(<CompareSlider />)
    expect(screen.getByTestId('compare-optimized-size')).toHaveTextContent('900 B')

    act(() => {
      useImagenStore.setState({
        images: [{ ...item, result: makeResult({ url: 'blob:optimized-new', outputBytes: 300 }) }],
      })
    })
    rerender(<CompareSlider />)
    expect(screen.getByTestId('compare-optimized-size')).toHaveTextContent('300 B')
    expect((screen.getByTestId('compare-optimized') as HTMLImageElement).src).toContain('blob:optimized-new')
  })
})

describe('crop alignment', () => {
  it('renders identical aspect frames on both sides when the result was cropped', () => {
    seedDoneImage({
      originalWidth: 1600,
      originalHeight: 900,
      result: { width: 900, height: 900, cropRect: { x: 350, y: 0, width: 900, height: 900 } },
    })
    render(<CompareSlider />)
    const frameA = screen.getByTestId('compare-frame-original')
    const frameB = screen.getByTestId('compare-frame-optimized')
    expect(frameA.style.aspectRatio).toBe('900 / 900')
    expect(frameB.style.aspectRatio).toBe('900 / 900')
    const original = screen.getByTestId('compare-original')
    // 1600/900 ≈ 177.78% width, offset -350/900 ≈ -38.89%
    expect(original.style.width).toBe(`${(1600 / 900) * 100}%`)
    expect(original.style.left).toBe(`-${(350 / 900) * 100}%`)
  })

  it('keeps the plain markup when the result has no crop', () => {
    seedDoneImage({ originalWidth: 1600, originalHeight: 900, result: { width: 800, height: 450 } })
    render(<CompareSlider />)
    expect(screen.queryByTestId('compare-frame-original')).not.toBeInTheDocument()
    expect(screen.getByTestId('compare-original')).toBeInTheDocument()
  })
})
