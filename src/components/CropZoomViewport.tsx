import { useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

const MAX_ZOOM = 8

/**
 * Magnification viewport for the crop editor. Zoom is a viewing aid only:
 * it scales the rendered crop UI and never touches the stored crop rect.
 * Drag stays reserved for the crop selection (panning excludes ReactCrop);
 * plain wheel pans, ctrl/cmd+wheel and pinch zoom, double-click resets.
 */
export default function CropZoomViewport({
  disabled,
  children,
}: {
  disabled: boolean
  children: React.ReactNode
}) {
  const [zoom, setZoom] = useState(1)

  return (
    <div className="relative w-full">
      <TransformWrapper
        minScale={1}
        maxScale={MAX_ZOOM}
        limitToBounds
        centerOnInit
        disabled={disabled}
        wheel={{ wheelDisabled: true, touchPadDisabled: false }}
        trackPadPanning={{ disabled: false }}
        panning={{ excluded: ['ReactCrop'] }}
        pinch={{ disabled: false }}
        doubleClick={{ mode: 'reset' }}
        onTransform={(_, state) => setZoom(state.scale)}
      >
        {/* The library defaults both divs to fit-content, which would defeat
            the preview img's max-w-full clamp on wide images. */}
        <TransformComponent wrapperClass="!w-full" contentClass="!w-full justify-center">
          {children}
        </TransformComponent>
      </TransformWrapper>
      {zoom > 1.001 && (
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
