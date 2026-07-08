import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dropzone from './Dropzone'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function makeFile(name: string, type: string, size = 100): File {
  return new File(['x'.repeat(size)], name, { type })
}

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('Dropzone', () => {
  it('renders an English add-images call to action and a choose-images control', () => {
    render(<Dropzone />)
    expect(screen.getByRole('button', { name: /choose images/i })).toBeEnabled()
    expect(screen.getByText(/drag (and|&) drop|drop images/i)).toBeInTheDocument()
  })

  it('exposes a file input constrained to image types and allowing multiple files', () => {
    render(<Dropzone />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.multiple).toBe(true)
    expect(input.accept).toBeTruthy()
    expect(input.accept.toLowerCase()).toContain('image')
  })

  it('adds exactly the selected images through the file picker', () => {
    render(<Dropzone />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [makeFile('a.jpg', 'image/jpeg'), makeFile('b.png', 'image/png')] },
    })
    expect(useImagenStore.getState().images.map((i) => i.name)).toEqual(['a.jpg', 'b.png'])
  })

  it('ignores non-image files and adds only the images from a mixed selection', () => {
    render(<Dropzone />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [
          makeFile('a.jpg', 'image/jpeg'),
          makeFile('notes.txt', 'text/plain'),
          makeFile('b.webp', 'image/webp'),
        ],
      },
    })
    expect(useImagenStore.getState().images.map((i) => i.name)).toEqual(['a.jpg', 'b.webp'])
  })

  it('appends rather than replaces on subsequent picker selections', () => {
    render(<Dropzone />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('a.jpg', 'image/jpeg')] } })
    fireEvent.change(input, { target: { files: [makeFile('b.jpg', 'image/jpeg')] } })
    expect(useImagenStore.getState().images.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('adds dropped image files and ignores dropped non-image files', () => {
    render(<Dropzone />)
    const zone = screen.getByTestId('dropzone')
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [makeFile('a.jpg', 'image/jpeg'), makeFile('notes.txt', 'text/plain')],
      },
    })
    expect(useImagenStore.getState().images.map((i) => i.name)).toEqual(['a.jpg'])
  })

  it('shows a drag-over affordance during dragover and clears it after dragleave', () => {
    render(<Dropzone />)
    const zone = screen.getByTestId('dropzone')
    expect(zone).toHaveAttribute('data-dragging', 'false')
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveAttribute('data-dragging', 'true')
    fireEvent.dragLeave(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveAttribute('data-dragging', 'false')
  })

  it('clears the drag-over affordance after a drop completes', () => {
    render(<Dropzone />)
    const zone = screen.getByTestId('dropzone')
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveAttribute('data-dragging', 'true')
    fireEvent.drop(zone, { dataTransfer: { files: [makeFile('a.jpg', 'image/jpeg')] } })
    expect(zone).toHaveAttribute('data-dragging', 'false')
  })
})
