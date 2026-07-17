import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useImperativeHandle } from 'react'
import CropZoomViewport, { clampPan } from './CropZoomViewport'

const h = vi.hoisted(() => ({
  setTransformCalls: [] as number[][],
  mockScale: 3,
}))

interface MockTransformState {
  scale: number
  positionX: number
  positionY: number
}

interface MockWrapperProps {
  ref?: React.Ref<unknown>
  children?: React.ReactNode
  minScale?: number
  maxScale?: number
  disabled?: boolean
  wheel?: { activationKeys?: (keys: string[]) => boolean }
  panning?: { excluded?: string[]; allowMiddleClickPan?: boolean; allowRightClickPan?: boolean }
  trackPadPanning?: { disabled?: boolean }
  pinch?: { disabled?: boolean }
  doubleClick?: { mode?: string }
  onTransform?: (ref: unknown, state: MockTransformState) => void
}

vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
    ref,
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
  }: MockWrapperProps) => {
    useImperativeHandle(ref, () => ({
      instance: {
        state: { scale: h.mockScale, positionX: -50, positionY: -40 },
        bounds: {
          minPositionX: -200,
          maxPositionX: 0,
          minPositionY: -150,
          maxPositionY: 0,
          scaleWidthFactor: 0,
          scaleHeightFactor: 0,
        },
      },
      setTransform: (...args: number[]) => h.setTransformCalls.push(args),
    }))
    return (
      <div
        data-testid="transform-wrapper"
        data-min-scale={minScale}
        data-max-scale={maxScale}
        data-disabled={disabled ? 'true' : 'false'}
        data-zoom-on-control={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Control']) ? 'true' : 'false'}
        data-zoom-on-meta={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Meta']) ? 'true' : 'false'}
        data-zoom-on-plain-wheel={typeof wheel?.activationKeys === 'function' && wheel.activationKeys([]) ? 'true' : 'false'}
        data-panning-excluded={(panning?.excluded ?? []).join(',')}
        data-allow-middle-pan={panning?.allowMiddleClickPan === false ? 'false' : 'true'}
        data-allow-right-pan={panning?.allowRightClickPan === false ? 'false' : 'true'}
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
    )
  },
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))

describe('clampPan', () => {
  it('passes through when bounds are null', () => {
    expect(clampPan(123, -456, null)).toEqual({ x: 123, y: -456 })
  })

  it('clamps to the bounds box', () => {
    const bounds = {
      minPositionX: -200,
      maxPositionX: 0,
      minPositionY: -150,
      maxPositionY: 0,
      scaleWidthFactor: 0,
      scaleHeightFactor: 0,
    }
    expect(clampPan(450, -540, bounds)).toEqual({ x: 0, y: -150 })
    expect(clampPan(-300, 25, bounds)).toEqual({ x: -200, y: 0 })
    expect(clampPan(-100, -75, bounds)).toEqual({ x: -100, y: -75 })
  })
})

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
    expect(wrapper).toHaveAttribute('data-allow-middle-pan', 'false')
    expect(wrapper).toHaveAttribute('data-allow-right-pan', 'false')
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

  it('enables wheel panning only while zoomed in', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const wrapper = screen.getByTestId('transform-wrapper')
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'true')

    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'false')

    fireEvent.click(screen.getByTestId('simulate-zoom-reset'))
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'true')
  })

  it('pans with middle-drag, clamped to the library bounds', () => {
    h.setTransformCalls.length = 0
    h.mockScale = 3
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const viewport = screen.getByTestId('crop-zoom-viewport')

    fireEvent.pointerDown(viewport, { button: 1, pointerId: 7, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 600, clientY: -400 })
    // origin (-50,-40) + delta (500,-500) = (450,-540) → clamped to (0,-150)
    expect(h.setTransformCalls.at(-1)).toEqual([0, -150, 3, 0])

    fireEvent.pointerUp(viewport, { pointerId: 7 })
    h.setTransformCalls.length = 0
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 300, clientY: 300 })
    expect(h.setTransformCalls).toHaveLength(0)
  })

  it('ignores left-button and not-zoomed middle drags', () => {
    h.setTransformCalls.length = 0
    h.mockScale = 3
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const viewport = screen.getByTestId('crop-zoom-viewport')
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 8, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(viewport, { pointerId: 8, clientX: 60, clientY: 60 })
    expect(h.setTransformCalls).toHaveLength(0)

    h.mockScale = 1
    render(<CropZoomViewport disabled={false}>y</CropZoomViewport>)
    const second = screen.getAllByTestId('crop-zoom-viewport').at(-1)!
    fireEvent.pointerDown(second, { button: 1, pointerId: 9, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(second, { pointerId: 9, clientX: 60, clientY: 60 })
    expect(h.setTransformCalls).toHaveLength(0)
  })

  it('abandons a middle-drag when disabled flips mid-gesture', () => {
    h.setTransformCalls.length = 0
    h.mockScale = 3
    const { rerender } = render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const viewport = screen.getByTestId('crop-zoom-viewport')

    fireEvent.pointerDown(viewport, { button: 1, pointerId: 11, clientX: 100, clientY: 100 })
    rerender(<CropZoomViewport disabled>x</CropZoomViewport>)
    fireEvent.pointerMove(viewport, { pointerId: 11, clientX: 200, clientY: 200 })
    expect(h.setTransformCalls).toHaveLength(0)

    // Session was dropped, not paused: re-enabling does not resume the drag.
    rerender(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    fireEvent.pointerMove(viewport, { pointerId: 11, clientX: 300, clientY: 300 })
    expect(h.setTransformCalls).toHaveLength(0)
  })
})
