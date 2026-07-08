import { useCallback, useEffect, useRef, useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { formatBytes } from '../lib/savings'

const JXL_MIME = 'image/jxl'

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export default function CompareSlider() {
  const selectedId = useImagenStore((state) => state.selectedId)
  const item = useImagenStore((state) =>
    state.selectedId ? state.images.find((entry) => entry.id === state.selectedId) ?? null : null,
  )
  const select = useImagenStore((state) => state.select)

  const [position, setPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

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

  if (!selectedId || !item || item.status !== 'done' || !item.result) return null

  const result = item.result
  const previewable = result.outputType !== JXL_MIME
  const clipRight = 100 - position

  const beginDrag = (clientX: number) => {
    draggingRef.current = true
    updateFromClientX(clientX)
  }

  return (
    <section
      data-testid="compare-view"
      role="dialog"
      aria-modal="false"
      aria-label={`Compare original and optimized ${item.name}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">Before / After</h2>
          <p data-testid="compare-filename" className="truncate text-xs text-slate-400" title={item.name}>
            {item.name}
          </p>
        </div>
        <button
          type="button"
          data-testid="compare-close"
          aria-label="Close compare"
          onClick={() => select(null)}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div
        ref={containerRef}
        data-testid="compare-canvas"
        onPointerDown={(event) => beginDrag(event.clientX)}
        className="relative aspect-video w-full touch-none select-none overflow-hidden rounded-lg bg-slate-900"
      >
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-slate-900">
          {previewable ? (
            <img
              data-testid="compare-optimized"
              src={result.url}
              alt={`Optimized ${item.name}`}
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div
              data-testid="compare-preview-unavailable"
              className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center"
            >
              <span className="text-sm font-medium text-slate-200">Preview not available for JPEG XL</span>
              <span className="text-xs text-slate-400">Your browser can’t display JPEG XL, but the download still works.</span>
            </div>
          )}
        </div>

        <div
          data-testid="compare-original-clip"
          data-reveal={Math.round(position)}
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-slate-900"
          style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }}
        >
          <img
            data-testid="compare-original"
            src={item.previewUrl}
            alt={`Original ${item.name}`}
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <span className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200">
          Original
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200">
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
          className="absolute top-0 bottom-0 -ml-px w-0.5 cursor-ew-resize bg-white/90 shadow"
        >
          <span className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-900 shadow">
            ⇔
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-1">
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
          className="w-full accent-sky-400"
        />
      </label>

      <div className="flex flex-wrap items-center gap-6 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-400">Original</span>
          <span data-testid="compare-original-size" className="font-medium text-slate-100">
            {formatBytes(item.originalBytes)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-400">Optimized</span>
          <span data-testid="compare-optimized-size" className="font-medium text-emerald-300">
            {formatBytes(result.outputBytes)}
          </span>
        </div>
      </div>
    </section>
  )
}
