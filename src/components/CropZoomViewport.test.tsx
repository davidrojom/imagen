import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CropZoomViewport from './CropZoomViewport'

interface MockTransformState {
  scale: number
  positionX: number
  positionY: number
}

interface MockWrapperProps {
  children?: React.ReactNode
  minScale?: number
  maxScale?: number
  disabled?: boolean
  wheel?: { activationKeys?: (keys: string[]) => boolean }
  panning?: { excluded?: string[] }
  trackPadPanning?: { disabled?: boolean }
  pinch?: { disabled?: boolean }
  doubleClick?: { mode?: string }
  onTransform?: (ref: unknown, state: MockTransformState) => void
}

vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
    children,
    minScale,
    maxScale,
    disabled,
    wheel,
    panning,
    trackPadPanning,
    pinch,
    doubleClick,
    onTransform,
  }: MockWrapperProps) => (
    <div
      data-testid="transform-wrapper"
      data-min-scale={minScale}
      data-max-scale={maxScale}
      data-disabled={disabled ? 'true' : 'false'}
      data-zoom-on-control={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Control']) ? 'true' : 'false'}
      data-zoom-on-meta={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Meta']) ? 'true' : 'false'}
      data-zoom-on-plain-wheel={typeof wheel?.activationKeys === 'function' && wheel.activationKeys([]) ? 'true' : 'false'}
      data-panning-excluded={(panning?.excluded ?? []).join(',')}
      data-trackpad-panning-disabled={trackPadPanning?.disabled ? 'true' : 'false'}
      data-pinch-disabled={pinch?.disabled ? 'true' : 'false'}
      data-double-click-mode={doubleClick?.mode ?? 'none'}
    >
      <button
        type="button"
        data-testid="simulate-zoom-2x"
        onClick={() => onTransform?.({}, { scale: 2.5, positionX: 0, positionY: 0 })}
      >
        zoom
      </button>
      <button
        type="button"
        data-testid="simulate-zoom-reset"
        onClick={() => onTransform?.({}, { scale: 1, positionX: 0, positionY: 0 })}
      >
        reset
      </button>
      {children}
    </div>
  ),
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))

describe('CropZoomViewport', () => {
  it('renders children inside the transform component', () => {
    render(
      <CropZoomViewport disabled={false}>
        <span data-testid="viewport-child">content</span>
      </CropZoomViewport>,
    )
    expect(screen.getByTestId('transform-component')).toContainElement(
      screen.getByTestId('viewport-child'),
    )
  })

  it('configures the gesture model from the spec', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const wrapper = screen.getByTestId('transform-wrapper')
    expect(wrapper).toHaveAttribute('data-min-scale', '1')
    expect(wrapper).toHaveAttribute('data-max-scale', '8')
    expect(wrapper).toHaveAttribute('data-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-zoom-on-control', 'true')
    expect(wrapper).toHaveAttribute('data-zoom-on-meta', 'true')
    expect(wrapper).toHaveAttribute('data-zoom-on-plain-wheel', 'false')
    expect(wrapper).toHaveAttribute('data-panning-excluded', 'ReactCrop')
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-pinch-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-double-click-mode', 'reset')
  })

  it('disables the transform wrapper when disabled', () => {
    render(<CropZoomViewport disabled>x</CropZoomViewport>)
    expect(screen.getByTestId('transform-wrapper')).toHaveAttribute('data-disabled', 'true')
  })

  it('shows the zoom badge only while zoomed in', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(screen.getByTestId('crop-zoom-badge')).toHaveTextContent(
      '250% · double-click to reset',
    )

    fireEvent.click(screen.getByTestId('simulate-zoom-reset'))
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()
  })
})
