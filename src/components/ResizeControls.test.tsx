import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResizeControls from './ResizeControls'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings('webp'),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('ResizeControls mode adaptation', () => {
  it('defaults to "none" with neither dimension nor percentage inputs shown', () => {
    render(<ResizeControls />)
    const mode = screen.getByTestId('resize-mode') as HTMLSelectElement
    expect(mode.value).toBe('none')
    expect(screen.queryByTestId('resize-width')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resize-height')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resize-percentage')).not.toBeInTheDocument()
  })

  it('offers exactly the three resize modes', () => {
    render(<ResizeControls />)
    const values = screen
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
    expect(values).toEqual(['none', 'dimensions', 'percentage'])
  })

  it('shows width/height and keep-aspect toggle in dimensions mode', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    expect(screen.getByTestId('resize-width')).toBeInTheDocument()
    expect(screen.getByTestId('resize-height')).toBeInTheDocument()
    expect(screen.getByTestId('resize-keep-aspect')).toBeInTheDocument()
    expect(screen.queryByTestId('resize-percentage')).not.toBeInTheDocument()
  })

  it('shows only the percentage input in percentage mode', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'percentage' } })
    expect(screen.getByTestId('resize-percentage')).toBeInTheDocument()
    expect(screen.queryByTestId('resize-width')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resize-height')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resize-keep-aspect')).not.toBeInTheDocument()
  })
})

describe('ResizeControls store wiring', () => {
  it('switching to percentage seeds a default of 100%', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'percentage' } })
    const resize = useImagenStore.getState().globalSettings.resize
    expect(resize.mode).toBe('percentage')
    expect(resize.percentage).toBe(100)
  })

  it('switching to dimensions seeds keep-aspect enabled by default', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    expect(useImagenStore.getState().globalSettings.resize.keepAspect).toBe(true)
  })

  it('updates width and height in the store', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '800' } })
    fireEvent.change(screen.getByTestId('resize-height'), { target: { value: '600' } })
    const resize = useImagenStore.getState().globalSettings.resize
    expect(resize.width).toBe(800)
    expect(resize.height).toBe(600)
  })

  it('toggles keep-aspect off and on', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.click(screen.getByTestId('resize-keep-aspect'))
    expect(useImagenStore.getState().globalSettings.resize.keepAspect).toBe(false)
    fireEvent.click(screen.getByTestId('resize-keep-aspect'))
    expect(useImagenStore.getState().globalSettings.resize.keepAspect).toBe(true)
  })

  it('updates the percentage value in the store', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByTestId('resize-percentage'), { target: { value: '50' } })
    expect(useImagenStore.getState().globalSettings.resize.percentage).toBe(50)
  })

  it('does not change the output format when resize changes', () => {
    useImagenStore.setState({ globalSettings: defaultEncodeSettings('avif') })
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByTestId('resize-percentage'), { target: { value: '50' } })
    expect(useImagenStore.getState().globalSettings.format).toBe('avif')
  })
})

describe('ResizeControls invalid input handling', () => {
  it('stores undefined (not 0/NaN) for an emptied width field', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '800' } })
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '' } })
    expect(useImagenStore.getState().globalSettings.resize.width).toBeUndefined()
  })

  it('stores undefined for a non-positive or non-numeric width', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '0' } })
    expect(useImagenStore.getState().globalSettings.resize.width).toBeUndefined()
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '-5' } })
    expect(useImagenStore.getState().globalSettings.resize.width).toBeUndefined()
  })

  it('stores undefined for an emptied percentage field', () => {
    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByTestId('resize-percentage'), { target: { value: '' } })
    expect(useImagenStore.getState().globalSettings.resize.percentage).toBeUndefined()
  })
})

describe('ResizeControls disabled while processing', () => {
  it('disables the mode selector while a batch is processing', () => {
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<ResizeControls />)
    expect(screen.getByTestId('resize-mode')).toBeDisabled()
  })
})

describe('crop-aware example', () => {
  it('previews resize math against the cropped dimensions', () => {
    useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageDimensions(id, 1600, 900)
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().setGlobalSettings({ resize: { mode: 'percentage', percentage: 50 } })
    render(<ResizeControls />)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent('900 × 900 → 450 × 450 px')
  })
})
