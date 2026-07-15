import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CropControls from './CropControls'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
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

describe('CropControls', () => {
  it('defaults to no crop and hides the adjust button', () => {
    render(<CropControls />)
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('none')
    expect(screen.queryByTestId('crop-adjust-button')).not.toBeInTheDocument()
  })

  it('choosing a preset sets the batch ratio in the store', () => {
    render(<CropControls />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: '16:9' } })
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'ratio', w: 16, h: 9 })
  })

  it('shows the adjust button when cropping is active and images exist, and opens the editor at the first image', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    render(<CropControls />)
    const button = screen.getByTestId('crop-adjust-button')
    fireEvent.click(button)
    expect(useImagenStore.getState().cropEditorId).toBe(useImagenStore.getState().images[0].id)
  })

  it('hides the adjust button when there are no images', () => {
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    render(<CropControls />)
    expect(screen.queryByTestId('crop-adjust-button')).not.toBeInTheDocument()
  })

  it('disables controls while processing', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg')])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<CropControls />)
    expect(screen.getByTestId('crop-ratio-select')).toBeDisabled()
    expect(screen.getByTestId('crop-adjust-button')).toBeDisabled()
  })
})
