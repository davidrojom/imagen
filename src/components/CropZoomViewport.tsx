import { useRef, useState } from 'react'
import {
  TransformComponent,
  TransformWrapper,
  type BoundsType,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'

const MAX_ZOOM = 8
// Animated resets can settle a hair above 1; treat anything at or below this
// as "not zoomed in" — hides the badge and disables wheel/middle-drag panning.
const ZOOM_ENGAGED_ABOVE = 1.001

// Any-of check: the library syncs ctrlKey/metaKey from event modifier flags,
// so this fires for Ctrl+wheel, Cmd+wheel, and trackpad pinch (ctrlKey), while
// plain wheel fails it and falls through to panning.
const isZoomActivationKey = (keys: string[]) => keys.includes('Control') || keys.includes('Meta')

// The library's setTransform does not respect limitToBounds; clamp targets to
// the bounds it computed for the current scale.
// eslint-disable-next-line react-refresh/only-export-components
export function clampPan(x: number, y: number, bounds: BoundsType | null): { x: number; y: number } {
  if (!bounds) return { x, y }
  return {
    x: Math.min(bounds.maxPositionX, Math.max(bounds.minPositionX, x)),
    y: Math.min(bounds.maxPositionY, Math.max(bounds.minPositionY, y)),
  }
}

interface PanSession {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

/**
 * Magnification viewport for the crop editor. Zoom is a viewing aid only:
 * it scales the rendered crop UI and never touches the stored crop rect.
 * Drag stays reserved for the crop selection (panning excludes ReactCrop);
 * plain wheel and middle-drag pan while zoomed, ctrl/cmd+wheel and pinch
 * zoom, double-click resets.
 */
export default function CropZoomViewport({
  disabled,
  children,
}: {
  disabled: boolean
  children: React.ReactNode
}) {
  const [zoom, setZoom] = useState(1)
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const panSession = useRef<PanSession | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const api = apiRef.current
    if (event.button !== 1 || disabled || !api) return
    if (api.instance.state.scale <= ZOOM_ENGAGED_ABOVE) return
    // Suppress the browser's middle-click autoscroll and own the gesture.
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    panSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: api.instance.state.positionX,
      originY: api.instance.state.positionY,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = panSession.current
    const api = apiRef.current
    if (!session || session.pointerId !== event.pointerId || !api) return
    const target = clampPan(
      session.originX + (event.clientX - session.startX),
      session.originY + (event.clientY - session.startY),
      api.instance.bounds,
    )
    api.setTransform(target.x, target.y, api.instance.state.scale, 0)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panSession.current?.pointerId === event.pointerId) panSession.current = null
  }

  return (
    <div
      data-testid="crop-zoom-viewport"
      className="relative w-full"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <TransformWrapper
        ref={apiRef}
        minScale={1}
        maxScale={MAX_ZOOM}
        limitToBounds
        centerOnInit
        disabled={disabled}
        wheel={{ activationKeys: isZoomActivationKey }}
        trackPadPanning={{ disabled: zoom <= ZOOM_ENGAGED_ABOVE }}
        panning={{ excluded: ['ReactCrop'], allowMiddleClickPan: false, allowRightClickPan: false }}
        pinch={{ disabled: false }}
        doubleClick={{ mode: 'reset' }}
        onTransform={(_, state) => setZoom(state.scale)}
      >
        {/* The library defaults both divs to fit-content, which would defeat
            the preview img's max-w-full clamp on wide images. */}
        <TransformComponent wrapperClass="w-full!" contentClass="w-full! justify-center">
          {children}
        </TransformComponent>
      </TransformWrapper>
      {zoom > ZOOM_ENGAGED_ABOVE && (
        <span
          data-testid="crop-zoom-badge"
          className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-ink backdrop-blur-sm"
        >
          {Math.round(zoom * 100)}% · double-click to reset
        </span>
      )}
    </div>
  )
}
