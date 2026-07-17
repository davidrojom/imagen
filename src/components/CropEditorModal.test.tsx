import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import CropEditorModal from './CropEditorModal'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

vi.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({
    children,
    aspect,
    crop,
    disabled,
    onChange,
    onComplete,
    className,
  }: {
    children: React.ReactNode
    aspect?: number
    crop?: { x: number; y: number; width: number; height: number }
    disabled?: boolean
    onChange?: (px: unknown, pct: unknown) => void
    onComplete?: (px: unknown, pct: unknown) => void
    className?: string
  }) => (
    <div
      data-testid="react-crop"
      data-aspect={aspect != null ? aspect.toFixed(4) : 'free'}
      data-disabled={disabled ? 'true' : 'false'}
      data-crop={crop ? [crop.x, crop.y, crop.width, crop.height].map(Math.round).join(',') : 'unset'}
      data-rc-class={className ?? ''}
    >
      <button
        type="button"
        data-testid="simulate-crop-complete"
        onClick={() =>
          onComplete?.(
            { unit: 'px', x: 0, y: 0, width: 0, height: 0 },
            { unit: '%', x: 10, y: 20, width: 50, height: 25 },
          )
        }
      >
        simulate
      </button>
      <button
        type="button"
        data-testid="simulate-crop-change"
        onClick={() =>
          onChange?.(
            { unit: 'px', x: 0, y: 0, width: 0, height: 0 },
            { unit: '%', x: 5, y: 5, width: 80, height: 80 },
          )
        }
      >
        simulate change
      </button>
      <button
        type="button"
        data-testid="simulate-crop-complete-tiny"
        onClick={() =>
          onComplete?.(
            { unit: 'px', x: 0, y: 0, width: 0, height: 0 },
            { unit: '%', x: 10, y: 20, width: 0.2, height: 0.2 },
          )
        }
      >
        simulate tiny
      </button>
      {children}
    </div>
  ),
}))

vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
    children,
    disabled,
    onTransform,
  }: {
    children?: React.ReactNode
    disabled?: boolean
    onTransform?: (ref: unknown, state: { scale: number; positionX: number; positionY: number }) => void
  }) => (
    <div data-testid="transform-wrapper" data-disabled={disabled ? 'true' : 'false'}>
      <button
        type="button"
        data-testid="simulate-zoom-2x"
        onClick={() => onTransform?.({}, { scale: 2, positionX: 0, positionY: 0 })}
      >
        zoom
      </button>
      {children}
    </div>
  ),
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function seedTwoImages(): string[] {
  const store = useImagenStore.getState()
  store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
  const ids = useImagenStore.getState().images.map((item) => item.id)
  store.setImageDimensions(ids[0], 1600, 900)
  store.setImageDimensions(ids[1], 800, 1200)
  return ids
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
})

describe('CropEditorModal', () => {
  it('renders nothing while closed', () => {
    seedTwoImages()
    render(<CropEditorModal />)
    expect(screen.queryByTestId('crop-editor')).not.toBeInTheDocument()
  })

  it('shows the active image with a counter and filmstrip', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor')).toBeInTheDocument()
    expect(screen.getByTestId('crop-editor-counter')).toHaveTextContent('1 of 2')
    expect(screen.getAllByTestId('crop-filmstrip-thumb')).toHaveLength(2)
    expect(screen.getAllByTestId('crop-filmstrip-thumb')[0]).toHaveAttribute('data-active', 'true')
  })

  it('exposes listbox option semantics on the filmstrip thumbs', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    const thumbs = screen.getAllByTestId('crop-filmstrip-thumb')
    expect(thumbs[0]).toHaveAttribute('role', 'option')
    expect(thumbs[0]).toHaveAttribute('aria-selected', 'true')
    expect(thumbs[1]).toHaveAttribute('aria-selected', 'false')
    expect(thumbs[0]).not.toHaveAttribute('aria-current')
  })

  it('disables the crop overlay while a batch is processing', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-disabled', 'true')
  })

  it('leaves the crop overlay enabled when no batch is running', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-disabled', 'false')
  })

  it('traps Tab focus inside the dialog, wrapping from the last control to the first', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    const dialog = screen.getByTestId('crop-editor')
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])',
    )
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('discards a rejected micro-selection so the overlay snaps back to the stored rect', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    const stored = screen.getByTestId('react-crop').getAttribute('data-crop')

    // Drag produces a live draft the overlay reflects…
    fireEvent.click(screen.getByTestId('simulate-crop-change'))
    expect(screen.getByTestId('react-crop').getAttribute('data-crop')).not.toBe(stored)

    // …but a sub-0.5% completion is rejected and must clear that draft.
    fireEvent.click(screen.getByTestId('simulate-crop-complete-tiny'))
    expect(screen.getByTestId('react-crop').getAttribute('data-crop')).toBe(stored)
    expect(useImagenStore.getState().images[0].crop?.rect).toBeUndefined()
  })

  it('locks the overlay to the batch ratio and seeds the centered crop', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    const rc = screen.getByTestId('react-crop')
    expect(rc).toHaveAttribute('data-aspect', (1).toFixed(4))
    // centered 1:1 on 1600x900 → x 350/1600 = 21.875%, width 900/1600 = 56.25%
    expect(rc).toHaveAttribute('data-crop', '22,0,56,100')
  })

  it('caps the crop view height on the ReactCrop element (inherit chain)', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-rc-class', 'max-h-[55dvh]')
  })

  it('shows a full-image selection when the free ratio has no stored rect', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'free' })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-crop', '0,0,100,100')
  })

  it('keeps filmstrip thumbs at a fixed size regardless of crop', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    for (const thumb of screen.getAllByTestId('crop-filmstrip-thumb')) {
      expect(thumb.className).toContain('size-14')
      expect(thumb.querySelector('img')?.className).toContain('object-cover')
    }
  })

  it('wraps the crop overlay in the zoom viewport', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('transform-wrapper')).toContainElement(
      screen.getByTestId('react-crop'),
    )
  })

  it('keeps the uncropped notice outside the zoom viewport', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setImageCrop(id1, { ratio: { kind: 'none' } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-uncropped')).toBeInTheDocument()
    expect(screen.queryByTestId('transform-wrapper')).not.toBeInTheDocument()
  })

  it('disables zoom while a batch is processing', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<CropEditorModal />)
    expect(screen.getByTestId('transform-wrapper')).toHaveAttribute('data-disabled', 'true')
  })

  it('resets zoom when navigating to another image', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(screen.getByTestId('crop-zoom-badge')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('crop-editor-next'))
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()
  })

  it('stores the completed crop as a natural-pixel rect (live-apply)', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'free' })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('simulate-crop-complete'))
    // 10%,20%,50%,25% of 1600x900
    expect(useImagenStore.getState().images[0].crop?.rect).toEqual({
      x: 160,
      y: 180,
      width: 800,
      height: 225,
    })
  })

  it('navigates with prev/next and by clicking filmstrip thumbs', () => {
    const [id1, id2] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-prev')).toBeDisabled()
    fireEvent.click(screen.getByTestId('crop-editor-next'))
    expect(useImagenStore.getState().cropEditorId).toBe(id2)
    fireEvent.click(screen.getAllByTestId('crop-filmstrip-thumb')[0])
    expect(useImagenStore.getState().cropEditorId).toBe(id1)
  })

  it('per-image ratio override drops the rect and re-seeds', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: '1:1' } })
    expect(useImagenStore.getState().images[0].crop).toEqual({ ratio: { kind: 'ratio', w: 1, h: 1 } })
  })

  it('reset returns the image to the batch default', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('crop-editor-reset'))
    expect(useImagenStore.getState().images[0].crop).toBeUndefined()
  })

  it('shows an uncropped notice instead of the overlay when the effective ratio is none', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { ratio: { kind: 'none' } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-uncropped')).toBeInTheDocument()
    expect(screen.queryByTestId('react-crop')).not.toBeInTheDocument()
  })

  it('closes on the close button and on Escape', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('crop-editor-close'))
    expect(useImagenStore.getState().cropEditorId).toBeNull()
    act(() => {
      useImagenStore.getState().openCropEditor(id1)
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })
})
