import { useEffect, useState } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useImagenStore } from '../store/useImagenStore'
import {
  effectiveCropRect,
  effectiveRatio,
  percentToRect,
  ratioLabel,
  ratioValue,
  rectToPercent,
} from '../lib/cropMath'
import { cropPreviewStyles } from '../lib/cropPreview'
import RatioPicker from './RatioPicker'
import type { ImageItem } from '../types'

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

function ArrowGlyph({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'left' ? <path d="M10 3.5 5.5 8l4.5 4.5" /> : <path d="M6 3.5 10.5 8 6 12.5" />}
    </svg>
  )
}

function FilmstripThumb({
  item,
  active,
  onSelect,
}: {
  item: ImageItem
  active: boolean
  onSelect: () => void
}) {
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const hasDims = item.originalWidth != null && item.originalHeight != null
  const dims = hasDims ? { width: item.originalWidth!, height: item.originalHeight! } : null
  const rect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined
  const styles = rect && dims ? cropPreviewStyles(rect, dims) : null

  return (
    <button
      type="button"
      data-testid="crop-filmstrip-thumb"
      data-active={active ? 'true' : 'false'}
      aria-label={`Edit crop for ${item.name}`}
      aria-current={active}
      onClick={onSelect}
      className={`relative h-14 shrink-0 cursor-pointer overflow-hidden rounded-lg transition-all duration-200 ${
        active ? 'ring-2 ring-ember' : 'opacity-60 ring-1 ring-white/[0.12] hover:opacity-100'
      }`}
    >
      {styles ? (
        <div className="relative h-full overflow-hidden" style={styles.frame}>
          <img src={item.previewUrl} alt="" style={styles.image} draggable={false} />
        </div>
      ) : (
        <img src={item.previewUrl} alt="" className="h-full w-auto object-cover" draggable={false} />
      )}
    </button>
  )
}

export default function CropEditorModal() {
  const cropEditorId = useImagenStore((state) => state.cropEditorId)
  const images = useImagenStore((state) => state.images)
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const openCropEditor = useImagenStore((state) => state.openCropEditor)
  const closeCropEditor = useImagenStore((state) => state.closeCropEditor)
  const setImageCrop = useImagenStore((state) => state.setImageCrop)
  const setImageDimensions = useImagenStore((state) => state.setImageDimensions)
  const processing = useImagenStore((state) => state.batch.status === 'processing')

  const [draft, setDraft] = useState<PercentCrop | null>(null)
  const [draftFor, setDraftFor] = useState<string | null>(null)

  const open = cropEditorId != null

  // Escape closes; the page behind must not scroll while the dialog is open
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCropEditor()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, closeCropEditor])

  const index = images.findIndex((entry) => entry.id === cropEditorId)
  const item = index >= 0 ? images[index] : null
  if (!open || !item) return null

  const hasDims = item.originalWidth != null && item.originalHeight != null
  const dims = hasDims ? { width: item.originalWidth!, height: item.originalHeight! } : null
  const ratio = effectiveRatio(item.crop, globalCrop)
  const storedRect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined

  const displayCrop: PercentCrop | undefined =
    draft && draftFor === item.id
      ? draft
      : dims && storedRect
        ? { unit: '%', ...rectToPercent(storedRect, dims) }
        : undefined

  const onComplete = (pct: PercentCrop) => {
    if (!dims || pct.width < 0.5 || pct.height < 0.5) return
    const rect = percentToRect(pct, dims)
    setImageCrop(item.id, { ...(item.crop ?? {}), rect })
    setDraft(null)
    setDraftFor(null)
  }

  const navigate = (target: ImageItem | undefined) => {
    if (!target) return
    setDraft(null)
    setDraftFor(null)
    openCropEditor(target.id)
  }

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (item.originalWidth != null) return
    const img = event.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageDimensions(item.id, img.naturalWidth, img.naturalHeight)
    }
  }

  const onFilmstripKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') navigate(images[index - 1])
    if (event.key === 'ArrowRight') navigate(images[index + 1])
  }

  const previewImg = (
    <img
      src={item.previewUrl}
      alt={item.name}
      onLoad={onImageLoad}
      draggable={false}
      className="max-h-[55dvh] w-auto max-w-full"
    />
  )

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-xl sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeCropEditor()
      }}
    >
      <section
        data-testid="crop-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Crop ${item.name}`}
        className="bezel w-full max-w-4xl animate-pop"
      >
        <div className="bezel-core flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto bg-canvas p-4 ring-1 ring-white/[0.04] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="label">Adjust crop</h2>
              <p className="mt-1 truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
            </div>
            <button
              type="button"
              data-testid="crop-editor-close"
              aria-label="Close crop editor"
              autoFocus
              onClick={closeCropEditor}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.07] hover:text-ink active:scale-95"
            >
              <CrossGlyph />
            </button>
          </div>

          <div className="checker flex items-center justify-center overflow-hidden rounded-xl p-2">
            {ratio.kind === 'none' ? (
              <div
                data-testid="crop-editor-uncropped"
                className="flex flex-col items-center gap-2 px-6 py-16 text-center"
              >
                {previewImg}
                <span className="text-xs text-ink-faint">
                  This image is not cropped. Pick an aspect ratio below to crop it.
                </span>
              </div>
            ) : (
              <ReactCrop
                crop={displayCrop}
                aspect={ratioValue(ratio)}
                onChange={(_, pct) => {
                  setDraft(pct)
                  setDraftFor(item.id)
                }}
                onComplete={(_, pct) => onComplete(pct)}
                ruleOfThirds
                keepSelection
                minWidth={8}
                minHeight={8}
              >
                {previewImg}
              </ReactCrop>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <RatioPicker
              key={item.id}
              label="Aspect ratio"
              idPrefix="editor"
              value={item.crop?.ratio ?? null}
              batchLabel={`Batch (${ratioLabel(globalCrop)})`}
              disabled={processing}
              onChange={(value) =>
                value === null ? setImageCrop(item.id, null) : setImageCrop(item.id, { ratio: value })
              }
            />
            <button
              type="button"
              data-testid="crop-editor-reset"
              disabled={processing}
              onClick={() => {
                setDraft(null)
                setDraftFor(null)
                setImageCrop(item.id, null)
              }}
              className="btn-ghost h-9 px-4 text-xs"
            >
              Reset to centered
            </button>
          </div>

          <div className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              data-testid="crop-editor-prev"
              aria-label="Previous image"
              disabled={index <= 0}
              onClick={() => navigate(images[index - 1])}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowGlyph direction="left" />
            </button>

            <div
              data-testid="crop-filmstrip"
              role="listbox"
              aria-label="Batch images"
              tabIndex={0}
              onKeyDown={onFilmstripKeyDown}
              className="flex flex-1 items-center gap-2 overflow-x-auto py-1"
            >
              {images.map((entry) => (
                <FilmstripThumb
                  key={entry.id}
                  item={entry}
                  active={entry.id === item.id}
                  onSelect={() => navigate(entry)}
                />
              ))}
            </div>

            <span data-testid="crop-editor-counter" className="shrink-0 font-mono text-[11px] text-ink-faint">
              {index + 1} of {images.length}
            </span>

            <button
              type="button"
              data-testid="crop-editor-next"
              aria-label="Next image"
              disabled={index >= images.length - 1}
              onClick={() => navigate(images[index + 1])}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowGlyph direction="right" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
