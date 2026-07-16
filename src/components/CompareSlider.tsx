import { useCallback, useEffect, useRef, useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { formatBytes, savingsPercent } from '../lib/savings'
import { cropPreviewStyles } from '../lib/cropPreview'

const JXL_MIME = 'image/jxl'

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function CrossGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  )
}

function DragGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </svg>
  )
}

export default function CompareSlider() {
  const selectedId = useImagenStore((state) => state.selectedId)
  const item = useImagenStore((state) =>
    state.selectedId ? state.images.find((entry) => entry.id === state.selectedId) ?? null : null,
  )
  const select = useImagenStore((state) => state.select)

  const [position, setPosition] = useState(50)
  const [lastSelectedId, setLastSelectedId] = useState(selectedId)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Reset the divider when a different image is inspected
  if (selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId)
    setPosition(50)
  }

  const open = selectedId != null && item?.status === 'done' && item.result != null

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100))
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return
      updateFromClientX(event.clientX)
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [updateFromClientX])

  // Escape closes; the page behind must not scroll while the dialog is open
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, select])

  if (!open || !item || item.status !== 'done' || !item.result) return null

  const result = item.result
  const previewable = result.outputType !== JXL_MIME
  const clipRight = 100 - position
  const savings = savingsPercent(item.originalBytes, result.outputBytes)

  const hasDims = item.originalWidth != null && item.originalHeight != null
  const cropRect = result.cropRect
  const alignCrop = cropRect != null && hasDims
  const frameStyle = alignCrop ? { aspectRatio: `${result.width} / ${result.height}` } : undefined
  const originalStyles = alignCrop
    ? cropPreviewStyles(cropRect, { width: item.originalWidth!, height: item.originalHeight! })
    : null

  const beginDrag = (clientX: number) => {
    draggingRef.current = true
    updateFromClientX(clientX)
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-xl sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) select(null)
      }}
    >
      <section
        data-testid="compare-view"
        role="dialog"
        aria-modal="true"
        aria-label={`Compare original and optimized ${item.name}`}
        className="bezel w-full max-w-4xl animate-pop"
      >
        <div className="bezel-core flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto bg-canvas p-4 ring-1 ring-white/[0.04] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="label">Before / after</h2>
            <p
              data-testid="compare-filename"
              className="mt-1 truncate text-sm font-medium"
              title={item.name}
            >
              {item.name}
            </p>
          </div>
          <button
            type="button"
            data-testid="compare-close"
            aria-label="Close compare"
            autoFocus
            onClick={() => select(null)}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.07] hover:text-ink active:scale-95"
          >
            <CrossGlyph />
          </button>
        </div>

        <div
          ref={containerRef}
          data-testid="compare-canvas"
          onPointerDown={(event) => beginDrag(event.clientX)}
          className="checker relative aspect-video w-full touch-none overflow-hidden rounded-xl select-none"
        >
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            {previewable ? (
              alignCrop ? (
                <div
                  data-testid="compare-frame-optimized"
                  className="relative max-h-full w-full overflow-hidden"
                  style={frameStyle}
                >
                  <img
                    data-testid="compare-optimized"
                    src={result.url}
                    alt={`Optimized ${item.name}`}
                    draggable={false}
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              ) : (
                <img
                  data-testid="compare-optimized"
                  src={result.url}
                  alt={`Optimized ${item.name}`}
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                />
              )
            ) : (
              <div
                data-testid="compare-preview-unavailable"
                className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-6 text-center"
              >
                <span className="text-sm font-medium">Preview not available for JPEG XL</span>
                <span className="text-xs text-ink-faint">
                  Your browser can’t display JPEG XL, but the download still works.
                </span>
              </div>
            )}
          </div>

          <div
            data-testid="compare-original-clip"
            data-reveal={Math.round(position)}
            className="checker absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }}
          >
            {alignCrop && originalStyles ? (
              <div
                data-testid="compare-frame-original"
                className="relative max-h-full w-full overflow-hidden"
                style={frameStyle}
              >
                <img
                  data-testid="compare-original"
                  src={item.previewUrl}
                  alt={`Original ${item.name}`}
                  draggable={false}
                  style={originalStyles.image}
                />
              </div>
            ) : (
              <img
                data-testid="compare-original"
                src={item.previewUrl}
                alt={`Original ${item.name}`}
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          <span className="pointer-events-none absolute top-3 left-3 rounded-full border border-white/[0.1] bg-black/55 px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-white/85 uppercase backdrop-blur-sm">
            Original
          </span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full border border-white/[0.1] bg-black/55 px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-white/85 uppercase backdrop-blur-sm">
            Optimized
          </span>

          <div
            data-testid="compare-divider"
            data-position={Math.round(position)}
            role="separator"
            aria-orientation="vertical"
            style={{ left: `${position}%` }}
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag(event.clientX)
            }}
            className="absolute top-0 bottom-0 -ml-px w-0.5 cursor-ew-resize bg-white/90 shadow-[0_0_12px_rgb(0_0_0/0.5)]"
          >
            <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_16px_rgb(0_0_0/0.55),inset_0_1px_0_rgb(255_255_255)] transition-transform duration-200 ease-fluid hover:scale-110">
              <DragGlyph />
            </span>
          </div>
        </div>

        <label className="flex flex-col">
          <span className="sr-only">Reveal position</span>
          <input
            data-testid="compare-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(position)}
            aria-label="Reveal position"
            onChange={(event) => setPosition(clamp(Number(event.target.value)))}
            className="slider"
          />
        </label>

        <div className="flex flex-wrap items-end gap-8">
          <div className="flex flex-col gap-1">
            <span className="label">Original</span>
            <span data-testid="compare-original-size" className="font-mono text-sm">
              {formatBytes(item.originalBytes)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label">Optimized</span>
            <span data-testid="compare-optimized-size" className="font-mono text-sm text-moss">
              {formatBytes(result.outputBytes)}
            </span>
          </div>
          {savings !== 0 ? (
            <span
              className={`mb-0.5 ml-auto rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                savings > 0
                  ? 'border-moss/25 bg-moss/10 text-moss'
                  : 'border-clay/25 bg-clay/10 text-clay'
              }`}
            >
              {savings > 0 ? `−${savings}%` : `+${Math.abs(savings)}%`}
            </span>
          ) : null}
        </div>
        </div>
      </section>
    </div>
  )
}
