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
      className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
        Output format
        <select
          data-testid="format-select"
          value={format}
          disabled={processing}
          onChange={(event) =>
            setGlobalSettings({ format: event.target.value as OutputFormat })
          }
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {FORMAT_IDS.map((id) => (
            <option key={id} value={id}>
              {getFormatSpec(id).label}
            </option>
          ))}
        </select>
      </label>

      {showQuality && spec.quality ? (
        <label className="flex min-w-48 flex-col gap-1 text-xs font-medium text-slate-300">
          <span>
            Quality: <span data-testid="quality-value">{quality ?? spec.quality.default}</span>
          </span>
          <input
            data-testid="quality-slider"
            type="range"
            min={spec.quality.min}
            max={spec.quality.max}
            value={quality ?? spec.quality.default}
            disabled={processing}
            onChange={(event) => setGlobalSettings({ quality: Number(event.target.value) })}
            className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      ) : null}

      {showLevel && spec.effort ? (
        <label className="flex min-w-48 flex-col gap-1 text-xs font-medium text-slate-300">
          <span>
            Optimization level:{' '}
            <span data-testid="level-value">{effort ?? spec.effort.default}</span>
          </span>
          <input
            data-testid="level-slider"
            type="range"
            min={spec.effort.min}
            max={spec.effort.max}
            value={effort ?? spec.effort.default}
            disabled={processing}
            onChange={(event) => setGlobalSettings({ effort: Number(event.target.value) })}
            className="accent-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      ) : null}
    </section>
  )
}
