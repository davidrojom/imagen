import { useImagenStore } from '../store/useImagenStore'
import { FORMAT_IDS, getFormatSpec } from '../codec/formats'
import type { OutputFormat } from '../types'

export default function SettingsPanel() {
  const format = useImagenStore((state) => state.globalSettings.format)
  const quality = useImagenStore((state) => state.globalSettings.quality)
  const effort = useImagenStore((state) => state.globalSettings.effort)
  const setGlobalSettings = useImagenStore((state) => state.setGlobalSettings)
  const processing = useImagenStore((state) => state.batch.status === 'processing')

  const spec = getFormatSpec(format)
  const showQuality = spec.hasQuality && spec.quality != null
  const showLevel = !spec.hasQuality && spec.effort != null

  return (
    <section
      data-testid="settings-panel"
      className="flex flex-wrap items-end gap-x-10 gap-y-5 px-5 py-5 sm:px-6"
    >
      <label className="flex flex-col gap-2.5">
        <span className="label">Output format</span>
        <select
          data-testid="format-select"
          value={format}
          disabled={processing}
          onChange={(event) =>
            setGlobalSettings({ format: event.target.value as OutputFormat })
          }
          className="control-select min-w-44"
        >
          {FORMAT_IDS.map((id) => (
            <option key={id} value={id}>
              {getFormatSpec(id).label}
            </option>
          ))}
        </select>
      </label>

      {showQuality && spec.quality ? (
        <label className="flex w-full min-w-52 flex-col gap-1.5 sm:max-w-72 sm:flex-1">
          <span className="label flex items-baseline justify-between">
            Quality
            <span data-testid="quality-value" className="font-mono text-xs text-ink">
              {quality ?? spec.quality.default}
            </span>
          </span>
          <input
            data-testid="quality-slider"
            type="range"
            min={spec.quality.min}
            max={spec.quality.max}
            value={quality ?? spec.quality.default}
            disabled={processing}
            onChange={(event) => setGlobalSettings({ quality: Number(event.target.value) })}
            className="slider"
          />
        </label>
      ) : null}

      {showLevel && spec.effort ? (
        <label className="flex w-full min-w-52 flex-col gap-1.5 sm:max-w-72 sm:flex-1">
          <span className="label flex items-baseline justify-between">
            Optimization level
            <span data-testid="level-value" className="font-mono text-xs text-ink">
              {effort ?? spec.effort.default}
            </span>
          </span>
          <input
            data-testid="level-slider"
            type="range"
            min={spec.effort.min}
            max={spec.effort.max}
            value={effort ?? spec.effort.default}
            disabled={processing}
            onChange={(event) => setGlobalSettings({ effort: Number(event.target.value) })}
            className="slider"
          />
        </label>
      ) : null}
    </section>
  )
}
