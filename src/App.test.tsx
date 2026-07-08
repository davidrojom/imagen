import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useImagenStore } from './store/useImagenStore'
import { defaultEncodeSettings } from './lib/settings'

function makeFile(name: string): File {
  return new File(['x'.repeat(100)], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
})

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Imagen' })).toBeInTheDocument()
  })

  it('shows the empty-state dropzone CTA and no grid initially', () => {
    render(<App />)
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
    expect(screen.queryByTestId('image-grid')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('image-card')).toHaveLength(0)
  })

  it('shows the grid once images are added and the dropzone remains available', () => {
    render(<App />)
    act(() => {
      useImagenStore.getState().addFiles([makeFile('a.jpg')])
    })
    expect(screen.getByTestId('image-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('image-card')).toHaveLength(1)
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('returns to the empty state after Clear all', () => {
    render(<App />)
    act(() => {
      useImagenStore.getState().addFiles([makeFile('a.jpg')])
    })
    expect(screen.getByTestId('image-grid')).toBeInTheDocument()
    act(() => {
      useImagenStore.getState().clearAll()
    })
    expect(screen.queryByTestId('image-grid')).not.toBeInTheDocument()
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })
})
