import { useImagenStore } from '../store/useImagenStore'
import { formatBytes, savingsPercent } from '../lib/savings'
import { getFormatSpec } from '../codec/formats'
import { getOptimizer } from '../codec/optimizer'
import { effectiveCropRect, effectiveRatio, ratioLabel } from '../lib/cropMath'
import { cropPreviewStyles } from '../lib/cropPreview'
import PerImageSettings, { type PerImageOptimizer } from './PerImageSettings'
import type { ImageItem, ImageStatus } from '../types'

const STATUS_META: Record<ImageStatus, { label: string; text: string; dot: string }> = {
  queued: { label: 'Queued', text: 'text-ink-faint', dot: 'bg-ink-faint' },
  processing: { label: 'Processing', text: 'text-ember', dot: 'animate-breathe bg-ember' },
  done: { label: 'Done', text: 'text-moss', dot: 'bg-moss' },
  error: { label: 'Error', text: 'text-clay', dot: 'bg-clay' },
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

function CropGlyph() {
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
      <path d="M4.5 1.5v10h10" />
      <path d="M1.5 4.5h10v10" />
    </svg>
  )
}

export default function ImageCard({
  item,
  index = 0,
  optimizer = getOptimizer(),
}: {
  item: ImageItem
  index?: number
  optimizer?: PerImageOptimizer
}) {
  const removeImage = useImagenStore((state) => state.removeImage)
  const setImageDimensions = useImagenStore((state) => state.setImageDimensions)
  const select = useImagenStore((state) => state.select)
  const globalSettings = useImagenStore((state) => state.globalSettings)
  const processing = useImagenStore((state) => state.batch.status === 'processing')
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const openCropEditor = useImagenStore((state) => state.openCropEditor)

  const hasDimensions = item.originalWidth != null && item.originalHeight != null

  const dims = hasDimensions
    ? { width: item.originalWidth!, height: item.originalHeight! }
    : null
  const cropRect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined
  // The thumbnail frame lives inside the aspect-4/3 checker box.
  const cropStyles = cropRect && dims ? cropPreviewStyles(cropRect, dims, 4 / 3) : null
  const cropRatio = effectiveRatio(item.crop, globalCrop)
  const cropBadge = cropRect ? (cropRatio.kind === 'ratio' ? ratioLabel(cropRatio) : 'Crop') : null

  const status = STATUS_META[item.status]
  const result = item.status === 'done' ? item.result : undefined
  const savings = result ? savingsPercent(item.originalBytes, result.outputBytes) : 0

  const effective = item.settings ?? globalSettings
  const spec = getFormatSpec(effective.format)
  const targetLabel =
    spec.hasQuality && spec.quality
      ? `${spec.label} · quality ${effective.quality ?? spec.quality.default}`
      : spec.effort
        ? `${spec.label} · level ${effective.effort ?? spec.effort.default}`
        : spec.label

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
      className="group flex animate-rise flex-col rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.07] transition-all duration-300 ease-fluid has-[.popover-open]:z-30 hover:-translate-y-0.5 hover:bg-white/[0.05] hover:shadow-[0_24px_50px_-28px_rgb(0_0_0/0.85)] hover:ring-white/[0.14]"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="relative p-1.5 pb-0">
        <div className="checker relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-[0.625rem]">
          {cropStyles ? (
            <div
              data-testid="thumbnail-crop-frame"
              className="relative overflow-hidden rounded-[0.375rem]"
              style={cropStyles.frame}
            >
              <img
                data-testid="thumbnail"
                src={item.previewUrl}
                alt={item.name}
                onLoad={onLoad}
                loading="lazy"
                decoding="async"
                style={cropStyles.image}
              />
            </div>
          ) : (
            <img
              data-testid="thumbnail"
              src={item.previewUrl}
              alt={item.name}
              onLoad={onLoad}
              loading="lazy"
              decoding="async"
              className="max-h-full max-w-full object-contain"
            />
          )}
          {item.status === 'processing' ? (
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
              <span className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/[0.08] to-transparent" />
            </span>
          ) : null}
          <button
            type="button"
            data-testid="crop-open-button"
            aria-label={`Crop ${item.name}`}
            disabled={processing}
            onClick={() => openCropEditor(item.id)}
            className="absolute top-2 left-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all duration-200 can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-black/75 hover:text-white focus-visible:opacity-100 active:scale-95 disabled:cursor-not-allowed"
          >
            <CropGlyph />
          </button>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => removeImage(item.id)}
            className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all duration-200 can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-black/75 hover:text-white focus-visible:opacity-100 active:scale-95"
          >
            <CrossGlyph />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="image-name"
            title={item.name}
            className="truncate text-[13px] font-medium"
          >
            {item.name}
          </span>
          <span
            data-testid="status"
            className={`flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${status.text}`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        <div className="flex items-center justify-between font-mono text-[11px] text-ink-faint">
          <span data-testid="dimensions">
            {hasDimensions ? `${item.originalWidth} × ${item.originalHeight}` : '— × —'}
          </span>
          <span className="flex items-center gap-1.5">
            {item.settings != null ? (
              <span
                data-testid="override-indicator"
                title="Uses custom settings (overrides global)"
                className="rounded-full border border-ember/30 bg-ember/10 px-1.5 py-px text-[9px] tracking-[0.08em] text-ember uppercase"
              >
                Custom
              </span>
            ) : null}
            {cropBadge ? (
              <span
                data-testid="crop-badge"
                title="This image will be cropped"
                className="rounded-full border border-white/[0.14] bg-white/[0.05] px-1.5 py-px text-[9px] tracking-[0.08em] text-ink-dim uppercase"
              >
                {cropBadge}
              </span>
            ) : null}
            <span data-testid="original-size">{formatBytes(item.originalBytes)}</span>
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-2.5">
          <div
            {...(result ? { 'data-result-url': result.url } : {})}
            className="flex flex-col gap-1 border-t border-white/[0.06] pt-2.5 font-mono text-xs"
          >
            {result ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span data-testid="output-size" className="text-ink">
                    {formatBytes(result.outputBytes)}
                  </span>
                  <span
                    data-testid="savings"
                    data-savings={savings}
                    className={savings > 0 ? 'text-moss' : savings === 0 ? 'text-ink-faint' : 'text-clay'}
                  >
                    {savings > 0
                      ? `−${savings}% smaller`
                      : savings === 0
                        ? 'No savings'
                        : `+${Math.abs(savings)}% larger`}
                  </span>
                </div>
                <span
                  data-testid="output-dimensions"
                  data-width={result.width}
                  data-height={result.height}
                  className="text-[11px] text-ink-faint"
                >
                  {result.width} × {result.height} px
                </span>
              </>
            ) : item.status === 'error' && item.error ? (
              <>
                <p data-testid="error-message" className="truncate text-clay" title={item.error}>
                  {item.error}
                </p>
                <span className="text-[11px] text-ink-faint">→ {targetLabel}</span>
              </>
            ) : (
              <>
                <span className="text-ink-faint">
                  {item.status === 'processing' ? 'Optimizing…' : 'Not optimized yet'}
                </span>
                <span className="text-[11px] text-ink-faint">→ {targetLabel}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {result ? (
              <>
                <button
                  type="button"
                  data-testid="compare-button"
                  aria-label={`Compare ${item.name}`}
                  onClick={() => select(item.id)}
                  className="btn-ghost h-8 flex-1 px-3 text-xs"
                >
                  Compare
                </button>
                <a
                  data-testid="download-link"
                  href={result.url}
                  download={result.outputName}
                  className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-ink px-3 text-xs font-semibold text-well transition-all duration-300 ease-fluid select-none hover:bg-white active:scale-[0.98]"
                >
                  Download
                </a>
              </>
            ) : (
              <button
                type="button"
                data-testid="optimize-button"
                aria-label={`Optimize ${item.name}`}
                disabled={processing}
                onClick={() => optimizer.optimizeOne(item.id)}
                className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-3 text-xs font-semibold text-well transition-all duration-300 ease-fluid select-none hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-ink"
              >
                <BoltGlyph />
                {item.status === 'error'
                  ? 'Retry'
                  : item.status === 'processing'
                    ? 'Optimizing…'
                    : 'Optimize'}
              </button>
            )}
          </div>

          <PerImageSettings item={item} />
        </div>
      </div>
    </li>
  )
}
