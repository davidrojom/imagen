import { useEffect, useRef, useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { effectiveCropRect } from '../lib/cropMath'
import { FORMAT_IDS, getFormatSpec } from '../codec/formats'
import { getOptimizer } from '../codec/optimizer'
import ResizeHint from './ResizeHint'
import type { EncodeSettings, ImageItem, OutputFormat, ResizeSettings } from '../types'

const MODE_OPTIONS: { value: ResizeSettings['mode']; label: string }[] = [
  { value: 'none', label: 'Keep original size' },
  { value: 'dimensions', label: 'Fit within dimensions' },
  { value: 'percentage', label: 'Scale by percentage' },
]

export interface PerImageOptimizer {
  optimizeOne: (id: string) => void
}

function parseDimension(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-300 ease-fluid ${open ? 'rotate-180' : ''}`}
    >
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  )
}

function BoltGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.75 1.75 3.5 9h3.75l-.5 5.25L12.5 7H8.75l.5-5.25Z" />
    </svg>
  )
}

export default function PerImageSettings({
  item,
  optimizer = getOptimizer(),
}: {
  item: ImageItem
  optimizer?: PerImageOptimizer
}) {
  const globalSettings = useImagenStore((state) => state.globalSettings)
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const override = useImagenStore(
    (state) => state.images.find((entry) => entry.id === item.id)?.settings ?? null,
  )
  const setImageSettings = useImagenStore((state) => state.setImageSettings)
  const processing = useImagenStore((state) => state.batch.status === 'processing')
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Popover dismissal: pointer down outside, or Escape (returning focus to the toggle)
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      const el = containerRef.current
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        setExpanded(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  const isOverridden = override != null
  const effective: EncodeSettings = override ?? globalSettings
  const spec = getFormatSpec(effective.format)
  const showQuality = spec.hasQuality && spec.quality != null
  const showLevel = !spec.hasQuality && spec.effort != null
  const resize = effective.resize
  const keepAspect = resize.keepAspect ?? true

  const update = (patch: Partial<EncodeSettings>) => setImageSettings(item.id, patch)
  const updateResize = (patch: Partial<ResizeSettings>) =>
    update({ resize: { ...resize, ...patch } })

  const onModeChange = (mode: ResizeSettings['mode']) => {
    if (mode === 'percentage') {
      updateResize({ mode, percentage: resize.percentage ?? 100 })
    } else if (mode === 'dimensions') {
      updateResize({ mode, keepAspect: resize.keepAspect ?? true })
    } else {
      updateResize({ mode })
    }
  }

  const onApply = () => {
    optimizer.optimizeOne(item.id)
    setExpanded(false)
  }

  return (
    <div ref={containerRef} data-testid="per-image-settings" className="relative">
      <button
        ref={toggleRef}
        type="button"
        data-testid="override-edit-toggle"
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={`Edit settings for ${item.name}`}
        disabled={processing}
        onClick={() => setExpanded((value) => !value)}
        className="btn-quiet -mx-2 w-fit"
      >
        {isOverridden ? (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ember" />
        ) : null}
        {expanded ? 'Hide settings' : isOverridden ? 'Custom settings' : 'Customize settings'}
        <ChevronGlyph open={expanded} />
      </button>

      {expanded ? (
        <div
          role="dialog"
          aria-label={`Settings for ${item.name}`}
          className="popover-open absolute bottom-full left-0 z-30 mb-2 flex w-72 max-w-[calc(100vw-3rem)] animate-pop flex-col gap-4 rounded-2xl bg-well p-4 shadow-[0_30px_70px_-25px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.06)] ring-1 ring-white/[0.12]"
        >
          <div className="flex h-5 items-center justify-between">
            <span className="label">This image only</span>
            {isOverridden ? (
              <button
                type="button"
                data-testid="override-reset"
                disabled={processing}
                onClick={() => setImageSettings(item.id, null)}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-faint transition-colors duration-200 hover:bg-white/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset to global
              </button>
            ) : null}
          </div>

          <label className="flex flex-col gap-2">
            <span className="label">Output format</span>
            <select
              data-testid="override-format-select"
              value={effective.format}
              disabled={processing}
              onChange={(event) => update({ format: event.target.value as OutputFormat })}
              className="control-select h-8 text-xs"
            >
              {FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {getFormatSpec(id).label}
                </option>
              ))}
            </select>
          </label>

          {showQuality && spec.quality ? (
            <label className="flex flex-col gap-1">
              <span className="label flex items-baseline justify-between">
                Quality
                <span data-testid="override-quality-value" className="font-mono text-[11px] text-ink">
                  {effective.quality ?? spec.quality.default}
                </span>
              </span>
              <input
                data-testid="override-quality-slider"
                type="range"
                min={spec.quality.min}
                max={spec.quality.max}
                value={effective.quality ?? spec.quality.default}
                disabled={processing}
                onChange={(event) => update({ quality: Number(event.target.value) })}
                className="slider"
              />
            </label>
          ) : null}

          {showLevel && spec.effort ? (
            <label className="flex flex-col gap-1">
              <span className="label flex items-baseline justify-between">
                Optimization level
                <span data-testid="override-level-value" className="font-mono text-[11px] text-ink">
                  {effective.effort ?? spec.effort.default}
                </span>
              </span>
              <input
                data-testid="override-level-slider"
                type="range"
                min={spec.effort.min}
                max={spec.effort.max}
                value={effective.effort ?? spec.effort.default}
                disabled={processing}
                onChange={(event) => update({ effort: Number(event.target.value) })}
                className="slider"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="label">Resize</span>
            <select
              data-testid="override-resize-mode"
              value={resize.mode}
              disabled={processing}
              onChange={(event) => onModeChange(event.target.value as ResizeSettings['mode'])}
              className="control-select h-8 text-xs"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {resize.mode === 'dimensions' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex w-20 flex-col gap-2">
                <span className="label">Width (px)</span>
                <input
                  data-testid="override-resize-width"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="auto"
                  value={resize.width ?? ''}
                  disabled={processing}
                  onChange={(event) => updateResize({ width: parseDimension(event.target.value) })}
                  className="control h-8 px-2.5 font-mono text-xs"
                />
              </label>
              <label className="flex w-20 flex-col gap-2">
                <span className="label">Height (px)</span>
                <input
                  data-testid="override-resize-height"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="auto"
                  value={resize.height ?? ''}
                  disabled={processing}
                  onChange={(event) => updateResize({ height: parseDimension(event.target.value) })}
                  className="control h-8 px-2.5 font-mono text-xs"
                />
              </label>
              <label className="flex h-8 cursor-pointer items-center gap-2 text-xs font-medium text-ink-dim transition-colors hover:text-ink">
                <input
                  data-testid="override-resize-keep-aspect"
                  type="checkbox"
                  checked={keepAspect}
                  disabled={processing}
                  onChange={(event) => updateResize({ keepAspect: event.target.checked })}
                  className="checkbox"
                />
                Keep aspect
              </label>
            </div>
          ) : null}

          {resize.mode === 'percentage' ? (
            <label className="flex w-24 flex-col gap-2">
              <span className="label">Scale (%)</span>
              <input
                data-testid="override-resize-percentage"
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={resize.percentage ?? ''}
                disabled={processing}
                onChange={(event) =>
                  updateResize({ percentage: parseDimension(event.target.value) })
                }
                className="control h-8 px-2.5 font-mono text-xs"
              />
            </label>
          ) : null}

          {resize.mode !== 'none' ? (
            <ResizeHint
              resize={resize}
              example={
                item.originalWidth != null && item.originalHeight != null
                  ? (() => {
                      // TS narrowing does not survive into the closure — assert non-null
                      const dims = { width: item.originalWidth!, height: item.originalHeight! }
                      const rect = effectiveCropRect(item.crop, globalCrop, dims)
                      return {
                        width: rect?.width ?? dims.width,
                        height: rect?.height ?? dims.height,
                      }
                    })()
                  : undefined
              }
            />
          ) : null}

          <button
            type="button"
            data-testid="override-apply"
            disabled={processing}
            onClick={onApply}
            className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink text-xs font-semibold text-well transition-all duration-300 ease-fluid select-none hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-ink"
          >
            <BoltGlyph />
            {item.result != null ? 'Re-optimize this image' : 'Optimize this image'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
