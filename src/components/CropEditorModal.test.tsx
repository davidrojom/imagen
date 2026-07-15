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
    onComplete,
  }: {
    children: React.ReactNode
    aspect?: number
    crop?: { x: number; y: number; width: number; height: number }
    onComplete?: (px: unknown, pct: unknown) => void
  }) => (
    <div
      data-testid="react-crop"
      data-aspect={aspect != null ? aspect.toFixed(4) : 'free'}
      data-crop={crop ? [crop.x, crop.y, crop.width, crop.height].map(Math.round).join(',') : 'unset'}
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
      {children}
    </div>
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
