import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImageGrid from './ImageGrid'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function makeFile(name: string): File {
  return new File(['x'.repeat(100)], name, { type: 'image/jpeg' })
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

describe('ImageGrid', () => {
  it('renders one card per image in add order', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')])
    render(<ImageGrid />)
    const cards = screen.getAllByTestId('image-card')
    expect(cards).toHaveLength(3)
    const names = screen.getAllByTestId('image-name').map((el) => el.textContent)
    expect(names).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('appends newly added images after existing ones preserving order', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg')])
    render(<ImageGrid />)
    act(() => {
      useImagenStore.getState().addFiles([makeFile('b.jpg')])
    })
    const names = screen.getAllByTestId('image-name').map((el) => el.textContent)
    expect(names).toEqual(['a.jpg', 'b.jpg'])
  })

  it('empties the grid when Clear all is activated', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    render(<ImageGrid />)
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(useImagenStore.getState().images).toHaveLength(0)
    expect(screen.queryAllByTestId('image-card')).toHaveLength(0)
  })
})
