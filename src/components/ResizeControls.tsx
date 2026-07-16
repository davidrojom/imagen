import { useImagenStore } from '../store/useImagenStore'
import { effectiveCropRect } from '../lib/cropMath'
import ResizeHint from './ResizeHint'
import type { ResizeSettings } from '../types'

const MODE_OPTIONS: { value: ResizeSettings['mode']; label: string }[] = [
  { value: 'none', label: 'Keep original size' },
  { value: 'dimensions', label: 'Fit within dimensions' },
  { value: 'percentage', label: 'Scale by percentage' },
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
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const exampleItem = useImagenStore((state) =>
    state.images.find((item) => item.originalWidth != null && item.originalHeight != null),
  )

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
      className="flex flex-wrap items-end gap-x-10 gap-y-5 px-5 py-5 sm:px-6"
    >
      <label className="flex flex-col gap-2.5">
        <span className="label">Resize</span>
        <select
          data-testid="resize-mode"
          value={resize.mode}
          disabled={processing}
          onChange={(event) => onModeChange(event.target.value as ResizeSettings['mode'])}
          className="control-select min-w-44"
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
          <label className="flex w-28 flex-col gap-2.5">
            <span className="label">Width (px)</span>
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
              className="control font-mono"
            />
          </label>

          <label className="flex w-28 flex-col gap-2.5">
            <span className="label">Height (px)</span>
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
              className="control font-mono"
            />
          </label>

          <label className="flex h-9 cursor-pointer items-center gap-2.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink">
            <input
              data-testid="resize-keep-aspect"
              type="checkbox"
              checked={keepAspect}
              disabled={processing}
              onChange={(event) => update({ keepAspect: event.target.checked })}
              className="checkbox"
            />
            Keep aspect ratio
          </label>
        </>
      ) : null}

      {resize.mode === 'percentage' ? (
        <label className="flex w-28 flex-col gap-2.5">
          <span className="label">Scale (%)</span>
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
            className="control font-mono"
          />
        </label>
      ) : null}

      {resize.mode !== 'none' ? (
        <div className="basis-full">
          <ResizeHint
            resize={resize}
            example={
              exampleItem
                ? (() => {
                    const dims = {
                      width: exampleItem.originalWidth!,
                      height: exampleItem.originalHeight!,
                    }
                    const rect = effectiveCropRect(exampleItem.crop, globalCrop, dims)
                    return {
                      width: rect?.width ?? dims.width,
                      height: rect?.height ?? dims.height,
                      name: exampleItem.name,
                    }
                  })()
                : undefined
            }
          />
        </div>
      ) : null}
    </section>
  )
}
