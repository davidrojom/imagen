import { useImagenStore } from '../store/useImagenStore'
import type { ResizeSettings } from '../types'

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

export default function ResizeControls() {
  const resize = useImagenStore((state) => state.globalSettings.resize)
  const setGlobalSettings = useImagenStore((state) => state.setGlobalSettings)
  const processing = useImagenStore((state) => state.batch.status === 'processing')

  const update = (patch: Partial<ResizeSettings>) => {
    setGlobalSettings({ resize: { ...resize, ...patch } })
  }

  const onModeChange = (mode: ResizeSettings['mode']) => {
    if (mode === 'percentage') {
      update({ mode, percentage: resize.percentage ?? 100 })
    } else if (mode === 'dimensions') {
      update({ mode, keepAspect: resize.keepAspect ?? true })
    } else {
      update({ mode })
    }
  }

  const keepAspect = resize.keepAspect ?? true

  return (
    <section
      data-testid="resize-controls"
      className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
        Resize
        <select
          data-testid="resize-mode"
          value={resize.mode}
          disabled={processing}
          onChange={(event) => onModeChange(event.target.value as ResizeSettings['mode'])}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {resize.mode === 'dimensions' ? (
        <>
          <label className="flex w-24 flex-col gap-1 text-xs font-medium text-slate-300">
            Max width
            <input
              data-testid="resize-width"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="auto"
              value={resize.width ?? ''}
              disabled={processing}
              onChange={(event) => update({ width: parseDimension(event.target.value) })}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="flex w-24 flex-col gap-1 text-xs font-medium text-slate-300">
            Max height
            <input
              data-testid="resize-height"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="auto"
              value={resize.height ?? ''}
              disabled={processing}
              onChange={(event) => update({ height: parseDimension(event.target.value) })}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <input
              data-testid="resize-keep-aspect"
              type="checkbox"
              checked={keepAspect}
              disabled={processing}
              onChange={(event) => update({ keepAspect: event.target.checked })}
              className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
            Keep aspect ratio
          </label>
        </>
      ) : null}

      {resize.mode === 'percentage' ? (
        <label className="flex w-28 flex-col gap-1 text-xs font-medium text-slate-300">
          Scale (%)
          <input
            data-testid="resize-percentage"
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            value={resize.percentage ?? ''}
            disabled={processing}
            onChange={(event) => update({ percentage: parseDimension(event.target.value) })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      ) : null}
    </section>
  )
}
