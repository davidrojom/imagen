import { useImagenStore, selectBatchProgress } from '../store/useImagenStore'
import { FORMAT_IDS, getFormatSpec } from '../codec/formats'
import { getOptimizer, type OptimizerLike } from '../codec/optimizer'
import type { OutputFormat } from '../types'

export default function BatchToolbar({
  optimizer = getOptimizer(),
}: {
  optimizer?: OptimizerLike
}) {
  const format = useImagenStore((state) => state.globalSettings.format)
  const quality = useImagenStore((state) => state.globalSettings.quality)
  const setGlobalSettings = useImagenStore((state) => state.setGlobalSettings)
  const imageCount = useImagenStore((state) => state.images.length)
  const batch = useImagenStore((state) => state.batch)
  const progress = useImagenStore(selectBatchProgress)

  const spec = getFormatSpec(format)
  const processing = batch.status === 'processing'
  const complete = batch.status === 'done' && batch.total > 0

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-end gap-4">
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

        {spec.hasQuality && spec.quality ? (
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

        <button
          type="button"
          aria-label="Optimize all"
          onClick={() => optimizer.optimizeAll()}
          disabled={processing || imageCount === 0}
          className="ml-auto rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing ? 'Optimizing…' : 'Optimize all'}
        </button>
      </div>

      {batch.total > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{complete ? 'Complete' : 'Optimizing'}</span>
            <span data-testid="batch-counter">
              {batch.completed} / {batch.total}
            </span>
          </div>
          <div
            data-testid="batch-progress"
            role="progressbar"
            aria-valuenow={batch.completed}
            aria-valuemin={0}
            aria-valuemax={batch.total}
            aria-label="Batch progress"
            className="h-2 w-full overflow-hidden rounded-full bg-slate-700"
          >
            <div
              className="h-full rounded-full bg-sky-400 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
            <span className="sr-only">
              {batch.completed} / {batch.total}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
