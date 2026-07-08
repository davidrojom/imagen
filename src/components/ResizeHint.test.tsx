import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ResizeHint from './ResizeHint'
import ResizeControls from './ResizeControls'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { ResizeSettings } from '../types'

const EXAMPLE = { width: 4000, height: 2250, name: 'large.png' }

function resize(overrides: Partial<ResizeSettings>): ResizeSettings {
  return { mode: 'none', ...overrides }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
})

describe('ResizeHint behavior descriptions', () => {
  it('renders nothing when resizing is off', () => {
    const { container } = render(<ResizeHint resize={resize({ mode: 'none' })} example={EXAMPLE} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('describes percentage scaling and previews the resulting dimensions', () => {
    render(
      <ResizeHint resize={resize({ mode: 'percentage', percentage: 50 })} example={EXAMPLE} />,
    )
    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/50%/)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent(/4000\s*×\s*2250\s*→\s*2000\s*×\s*1125/)
  })

  it('says a width-only fit keeps proportions and can scale up or down', () => {
    render(
      <ResizeHint
        resize={resize({ mode: 'dimensions', width: 1600, keepAspect: true })}
        example={{ width: 96, height: 64 }}
      />,
    )
    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/keeping proportions/i)
    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/up or down/i)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent(/96\s*×\s*64\s*→\s*1600\s*×\s*1067/)
  })

  it('warns that disabling keep-aspect stretches without preserving proportions', () => {
    render(
      <ResizeHint
        resize={resize({ mode: 'dimensions', width: 800, height: 800, keepAspect: false })}
        example={EXAMPLE}
      />,
    )
    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/not preserved/i)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent(/→\s*800\s*×\s*800/)
  })

  it('prompts for input when the fit has no dimensions yet and shows no preview', () => {
    render(<ResizeHint resize={resize({ mode: 'dimensions', keepAspect: true })} example={EXAMPLE} />)
    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/width and\/or height/i)
    expect(screen.queryByTestId('resize-preview')).not.toBeInTheDocument()
  })

  it('marks a no-op resize as unchanged instead of showing an arrow', () => {
    render(
      <ResizeHint resize={resize({ mode: 'percentage', percentage: 100 })} example={EXAMPLE} />,
    )
    expect(screen.getByTestId('resize-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('resize-preview')).not.toBeInTheDocument()
  })
})

describe('ResizeControls integration', () => {
  it('shows the behavior hint with a live preview from a loaded image', () => {
    useImagenStore.getState().addFiles([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageDimensions(id, 4000, 2250)

    render(<ResizeControls />)
    fireEvent.change(screen.getByTestId('resize-mode'), { target: { value: 'dimensions' } })
    fireEvent.change(screen.getByTestId('resize-width'), { target: { value: '1600' } })

    expect(screen.getByTestId('resize-hint')).toHaveTextContent(/keeping proportions/i)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent(/4000\s*×\s*2250\s*→\s*1600\s*×\s*900/)
  })
})
