import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerImageSettings from './PerImageSettings'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { EncodeSettings, ImageItem, OutputFormat } from '../types'

function resetStore(format: OutputFormat = 'webp'): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(format),
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

function currentItem(): ImageItem {
  return useImagenStore.getState().images[0]
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('PerImageSettings editor visibility', () => {
  it('keeps the editor collapsed until its toggle is activated', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    expect(screen.queryByTestId('override-format-select')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    expect(screen.getByTestId('override-format-select')).toBeInTheDocument()
  })

  it('offers all five output formats seeded from the global format', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    const select = screen.getByTestId('override-format-select') as HTMLSelectElement
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels).toEqual(['JPEG', 'WebP', 'AVIF', 'PNG', 'JPEG XL'])
    expect(select.value).toBe('webp')
  })
})

describe('PerImageSettings creates overrides only for its image', () => {
  it('overriding the format creates an override without touching global settings', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    fireEvent.change(screen.getByTestId('override-format-select'), { target: { value: 'oxipng' } })
    expect(currentItem().settings?.format).toBe('oxipng')
    expect(useImagenStore.getState().globalSettings.format).toBe('webp')
  })

  it('overriding the quality creates an override with the new quality', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    fireEvent.change(screen.getByTestId('override-quality-slider'), { target: { value: '20' } })
    expect(currentItem().settings?.quality).toBe(20)
    expect(useImagenStore.getState().globalSettings.quality).toBe(75)
  })

  it('shows an optimization-level control (not a quality slider) for a PNG override', () => {
    const item = seedItem({ settings: defaultEncodeSettings('oxipng') })
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    expect(screen.getByTestId('override-level-slider')).toBeInTheDocument()
    expect(screen.queryByTestId('override-quality-slider')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('override-level-slider'), { target: { value: '5' } })
    expect(currentItem().settings?.effort).toBe(5)
  })

  it('overriding the resize creates a per-image resize override', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    fireEvent.change(screen.getByTestId('override-resize-mode'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByTestId('override-resize-percentage'), { target: { value: '50' } })
    expect(currentItem().settings?.resize).toMatchObject({ mode: 'percentage', percentage: 50 })
    expect(useImagenStore.getState().globalSettings.resize.mode).toBe('none')
  })

  it('stores undefined (not 0/NaN) for an emptied dimension field', () => {
    const item = seedItem()
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    fireEvent.change(screen.getByTestId('override-resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.change(screen.getByTestId('override-resize-width'), { target: { value: '0' } })
    expect(currentItem().settings?.resize.width).toBeUndefined()
  })
})

describe('PerImageSettings reset to global', () => {
  it('does not offer a reset control when the image uses global settings', () => {
    const item = seedItem({ settings: null })
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    expect(screen.queryByTestId('override-reset')).not.toBeInTheDocument()
  })

  it('clears the override back to global when reset is activated', () => {
    const item = seedItem({ settings: { ...defaultEncodeSettings('avif'), quality: 30 } })
    render(<PerImageSettings item={item} />)
    fireEvent.click(screen.getByTestId('override-edit-toggle'))
    fireEvent.click(screen.getByTestId('override-reset'))
    expect(currentItem().settings).toBeNull()
  })
})

describe('PerImageSettings disabled while processing', () => {
  it('disables the editor toggle while a batch is processing', () => {
    const item = seedItem()
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<PerImageSettings item={item} />)
    expect(screen.getByTestId('override-edit-toggle')).toBeDisabled()
  })
})

describe('PerImageSettings independent overrides', () => {
  it('keeps two images on distinct format overrides while a third stays global', () => {
    const a = seedItem({ id: 'a', name: 'a.jpg' })
    const b: ImageItem = { ...a, id: 'b', name: 'b.jpg', previewUrl: 'blob:b' }
    const c: ImageItem = { ...a, id: 'c', name: 'c.jpg', previewUrl: 'blob:c' }
    useImagenStore.setState({ images: [a, b, c] })

    useImagenStore.getState().setImageSettings('a', { format: 'oxipng' })
    useImagenStore.getState().setImageSettings('b', { format: 'avif' })

    const settings = useImagenStore.getState().images.map((i) => i.settings)
    expect((settings[0] as EncodeSettings).format).toBe('oxipng')
    expect((settings[1] as EncodeSettings).format).toBe('avif')
    expect(settings[2]).toBeNull()
  })
})
