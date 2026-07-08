import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BatchToolbar from './BatchToolbar'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { ImageItem, ImageResult } from '../types'
import type { OptimizerLike } from '../codec/optimizer'

const downloadImagesZip = vi.fn<(items: Iterable<ImageItem>) => Promise<void>>(() =>
  Promise.resolve(),
)
vi.mock('../lib/zip', () => ({
  downloadImagesZip: (items: Iterable<ImageItem>) => downloadImagesZip(items),
}))

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

function doneResult(name: string): ImageResult {
  return {
    blob: new Blob(['x']),
    url: 'blob:out',
    outputType: 'image/webp',
    outputBytes: 1,
    width: 1,
    height: 1,
    outputName: name,
  }
}

function fakeOptimizer() {
  const optimizer: OptimizerLike = { optimizeAll: vi.fn(), clear: vi.fn() }
  return optimizer as OptimizerLike & { optimizeAll: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  downloadImagesZip.mockClear()
  resetStore()
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

describe('BatchToolbar Download all as ZIP', () => {
  it('disables the ZIP action when no item is done', () => {
    seedItem({ status: 'queued' })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.getByRole('button', { name: /download all as zip/i })).toBeDisabled()
  })

  it('disables the ZIP action while items are only processing', () => {
    seedItem({ status: 'processing' })
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.getByRole('button', { name: /download all as zip/i })).toBeDisabled()
  })

  it('enables the ZIP action once at least one item is done', () => {
    seedItem({ status: 'done', result: doneResult('photo.webp') })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    expect(screen.getByRole('button', { name: /download all as zip/i })).toBeEnabled()
  })

  it('builds a ZIP from the current done items when clicked', async () => {
    useImagenStore.setState({
      images: [
        {
          id: 'a',
          file: new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
          name: 'a.jpg',
          sourceType: 'image/jpeg',
          originalBytes: 10,
          previewUrl: 'blob:a',
          settings: null,
          status: 'done',
          result: doneResult('a.webp'),
        },
        {
          id: 'b',
          file: new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
          name: 'b.jpg',
          sourceType: 'image/jpeg',
          originalBytes: 10,
          previewUrl: 'blob:b',
          settings: null,
          status: 'queued',
        },
      ],
    })
    render(<BatchToolbar optimizer={fakeOptimizer()} />)
    fireEvent.click(screen.getByRole('button', { name: /download all as zip/i }))
    await waitFor(() => expect(downloadImagesZip).toHaveBeenCalledTimes(1))
    const passed = Array.from(downloadImagesZip.mock.calls[0][0] as Iterable<ImageItem>)
    expect(passed.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
