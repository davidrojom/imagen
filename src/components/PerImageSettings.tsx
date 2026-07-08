import { useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { FORMAT_IDS, getFormatSpec } from '../codec/formats'
import type { EncodeSettings, ImageItem, OutputFormat, ResizeSettings } from '../types'

const MODE_OPTIONS: { value: ResizeSettings['mode']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'dimensions', label: 'Fit to dimensions' },
  { value: 'percentage', label: 'Percentage' },
]

function parseDimension(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export default function PerImageSettings({ item }: { item: ImageItem }) {
  const globalSettings = useImagenStore((state) => state.globalSettings)
  const override = useImagenStore(
    (state) => state.images.find((entry) => entry.id === item.id)?.settings ?? null,
  )
  const setImageSettings = useImagenStore((state) => state.setImageSettings)
  const processing = useImagenStore((state) => state.batch.status === 'processing')
  const [expanded, setExpanded] = useState(false)

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

  return (
    <div data-testid="per-image-settings" className="mt-2 flex flex-col gap-2">
      <button
        type="button"
        data-testid="override-edit-toggle"
        aria-expanded={expanded}
        aria-label={`Edit settings for ${item.name}`}
        disabled={processing}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {expanded ? 'Hide settings' : isOverridden ? 'Edit custom settings' : 'Customize settings'}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
            Output format
            <select
              data-testid="override-format-select"
              value={effective.format}
              disabled={processing}
              onChange={(event) => update({ format: event.target.value as OutputFormat })}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {getFormatSpec(id).label}
                </option>
              ))}
            </select>
          </label>

          {showQuality && spec.quality ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
              <span>
                Quality:{' '}
                <span data-testid="override-quality-value">
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
                className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          ) : null}

          {showLevel && spec.effort ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
              <span>
                Optimization level:{' '}
                <span data-testid="override-level-value">
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
                className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
            Resize
            <select
              data-testid="override-resize-mode"
              value={resize.mode}
              disabled={processing}
              onChange={(event) => onModeChange(event.target.value as ResizeSettings['mode'])}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              <label className="flex w-20 flex-col gap-1 text-xs font-medium text-slate-300">
                Max width
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
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="flex w-20 flex-col gap-1 text-xs font-medium text-slate-300">
                Max height
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
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <input
                  data-testid="override-resize-keep-aspect"
                  type="checkbox"
                  checked={keepAspect}
                  disabled={processing}
                  onChange={(event) => updateResize({ keepAspect: event.target.checked })}
                  className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
                Keep aspect ratio
              </label>
            </div>
          ) : null}

          {resize.mode === 'percentage' ? (
            <label className="flex w-24 flex-col gap-1 text-xs font-medium text-slate-300">
              Scale (%)
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
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          ) : null}

          {isOverridden ? (
            <button
              type="button"
              data-testid="override-reset"
              disabled={processing}
              onClick={() => setImageSettings(item.id, null)}
              className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset to global
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
