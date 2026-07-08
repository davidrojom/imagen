import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BatchToolbar from './BatchToolbar'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { ImageItem } from '../types'
import type { OptimizerLike } from '../codec/optimizer'

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings('webp'),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
}

function seedItem(overrides: Partial<ImageItem> = {}): void {
  const item: ImageItem = {
    id: 'id-1',
    file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    name: 'photo.jpg',
    sourceType: 'image/jpeg',
    originalBytes: 2048,
    previewUrl: 'blob:preview',
    settings: null,
    status: 'queued',
    ...overrides,
  }
  useImagenStore.setState({ images: [item] })
}

function fakeOptimizer() {
  const optimizer: OptimizerLike = { optimizeAll: vi.fn(), clear: vi.fn() }
  return optimizer as OptimizerLike & { optimizeAll: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('BatchToolbar format + quality controls', () => {
  it('offers all five output formats with WebP selected by default', () => {
    seedItem()
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    const select = screen.getByTestId('format-select') as HTMLSelectElement
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels).toEqual(['JPEG', 'WebP', 'AVIF', 'PNG', 'JPEG XL'])
    expect(select.value).toBe('webp')
  })

  it('shows a default quality value for the lossy default format', () => {
    seedItem()
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    const quality = screen.getByTestId('quality-slider') as HTMLInputElement
    expect(quality.value).toBe('75')
  })

  it('changing the format updates the global settings', () => {
    seedItem()
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    fireEvent.change(screen.getByTestId('format-select'), { target: { value: 'avif' } })
    expect(useImagenStore.getState().globalSettings.format).toBe('avif')
  })

  it('changing the quality updates the global settings', () => {
    seedItem()
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    fireEvent.change(screen.getByTestId('quality-slider'), { target: { value: '40' } })
    expect(useImagenStore.getState().globalSettings.quality).toBe(40)
  })

  it('hides the lossy quality slider when PNG is selected', () => {
    seedItem()
    useImagenStore.getState().setGlobalSettings({ format: 'oxipng' })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.queryByTestId('quality-slider')).not.toBeInTheDocument()
  })
})

describe('BatchToolbar Optimize all + progress', () => {
  it('invokes the optimizer when Optimize all is clicked', () => {
    seedItem()
    const optimizer = fakeOptimizer()
    render(<BatchToolbar optimizer={optimizer} />)
    fireEvent.click(screen.getByRole('button', { name: /optimize all/i }))
    expect(optimizer.optimizeAll).toHaveBeenCalledTimes(1)
  })

  it('disables Optimize all while a batch is processing', () => {
    seedItem({ status: 'processing' })
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.getByRole('button', { name: /optimize all/i })).toBeDisabled()
  })

  it('disables the format and quality controls while a batch is processing', () => {
    seedItem({ status: 'processing' })
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.getByTestId('format-select')).toBeDisabled()
    expect(screen.getByTestId('quality-slider')).toBeDisabled()
  })

  it('shows a batch progress indicator with completed/total that reaches complete', () => {
    seedItem({ status: 'done' })
    useImagenStore.setState({ batch: { status: 'processing', total: 4, completed: 1 } })
    const { rerender } = render(<BatchToolbar optimizer={fakeOptimizer()} />)
    const progress = screen.getByTestId('batch-progress')
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    expect(progress).toHaveTextContent(/1\s*\/\s*4/)

    act(() => {
      useImagenStore.setState({ batch: { status: 'done', total: 4, completed: 4 } })
    })
    rerender(<BatchToolbar optimizer={fakeOptimizer()} />)
    const done = screen.getByTestId('batch-progress')
    expect(done).toHaveAttribute('aria-valuenow', '4')
    expect(done).toHaveTextContent(/4\s*\/\s*4|complete/i)
  })
})
