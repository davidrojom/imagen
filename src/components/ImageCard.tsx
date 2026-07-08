import { useImagenStore } from '../store/useImagenStore'
import { formatBytes, savingsPercent } from '../lib/savings'
import type { ImageItem, ImageStatus } from '../types'

const STATUS_META: Record<ImageStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-slate-700 text-slate-200' },
  processing: { label: 'Processing', className: 'bg-amber-500/20 text-amber-300' },
  done: { label: 'Done', className: 'bg-emerald-500/20 text-emerald-300' },
  error: { label: 'Error', className: 'bg-rose-500/20 text-rose-300' },
}

export default function ImageCard({ item }: { item: ImageItem }) {
  const removeImage = useImagenStore((state) => state.removeImage)
  const setImageDimensions = useImagenStore((state) => state.setImageDimensions)

  const hasDimensions = item.originalWidth != null && item.originalHeight != null
  const status = STATUS_META[item.status]
  const result = item.status === 'done' ? item.result : undefined
  const savings = result ? savingsPercent(item.originalBytes, result.outputBytes) : 0

  const onLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (item.originalWidth != null) return
    const img = event.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageDimensions(item.id, img.naturalWidth, img.naturalHeight)
    }
  }

  return (
    <li
      data-testid="image-card"
      className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-800/40"
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-slate-900">
        <img
          data-testid="thumbnail"
          src={item.previewUrl}
          alt={item.name}
          onLoad={onLoad}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <span
            data-testid="image-name"
            title={item.name}
            className="truncate text-sm font-medium text-slate-100"
          >
            {item.name}
          </span>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => removeImage(item.id)}
            className="shrink-0 rounded-md px-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span data-testid="dimensions">
            {hasDimensions ? `${item.originalWidth} × ${item.originalHeight}` : '— × —'}
          </span>
          <span data-testid="original-size">{formatBytes(item.originalBytes)}</span>
        </div>
        <span
          data-testid="status"
          className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
        {item.status === 'error' && item.error ? (
          <p data-testid="error-message" className="mt-1 text-xs text-rose-300" title={item.error}>
            {item.error}
          </p>
        ) : null}
        {result ? (
          <div
            data-result-url={result.url}
            className="mt-1 flex items-center justify-between text-xs"
          >
            <span data-testid="output-size" className="text-slate-300">
              → {formatBytes(result.outputBytes)}
            </span>
            <span
              data-testid="savings"
              data-savings={savings}
              className={
                savings > 0
                  ? 'font-medium text-emerald-300'
                  : 'font-medium text-rose-300'
              }
            >
              {savings > 0
                ? `−${savings}% smaller`
                : savings === 0
                  ? 'No savings'
                  : `+${Math.abs(savings)}% larger`}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  )
}
