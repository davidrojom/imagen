import { useState } from 'react'
import {
  useImagenStore,
  selectBatchProgress,
  selectDoneCount,
  selectErrorCount,
} from '../store/useImagenStore'
import { getOptimizer, type OptimizerLike } from '../codec/optimizer'
import { downloadImagesZip } from '../lib/zip'
import { formatBytes } from '../lib/savings'

function BoltGlyph() {
  return (
    <svg
      width="13"
      height="13"
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

export default function BatchToolbar({
  optimizer = getOptimizer(),
}: {
  optimizer?: OptimizerLike
}) {
  const imageCount = useImagenStore((state) => state.images.length)
  const batch = useImagenStore((state) => state.batch)
  const progress = useImagenStore(selectBatchProgress)
  const doneCount = useImagenStore(selectDoneCount)
  const errorCount = useImagenStore(selectErrorCount)
  const savedTotal = useImagenStore((state) =>
    state.images.reduce(
      (acc, item) =>
        item.status === 'done' && item.result
          ? acc + (item.originalBytes - item.result.outputBytes)
          : acc,
      0,
    ),
  )
  const doneOriginalTotal = useImagenStore((state) =>
    state.images.reduce(
      (acc, item) => (item.status === 'done' && item.result ? acc + item.originalBytes : acc),
      0,
    ),
  )
  const [zipping, setZipping] = useState(false)

  const processing = batch.status === 'processing'
  const complete = batch.status === 'done' && batch.total > 0
  const percent = Math.round(progress * 100)
  const savedPercent =
    doneOriginalTotal > 0 ? Math.round((savedTotal / doneOriginalTotal) * 100) : 0

  const handleDownloadZip = async () => {
    if (zipping) return
    setZipping(true)
    try {
      await downloadImagesZip(useImagenStore.getState().images)
    } finally {
      setZipping(false)
    }
  }

  return (
    <section className="flex flex-col gap-5 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          {doneCount > 0 && savedTotal > 0 ? (
            <>
              <span className="label">Batch result</span>
              <span className="font-mono text-sm text-moss">
                −{formatBytes(savedTotal)}
                <span className="text-ink-faint"> · </span>
                {savedPercent}% smaller
              </span>
            </>
          ) : (
            <span className="text-xs text-ink-faint">
              {processing
                ? 'Encoding on your device — feel free to keep the tab in the background.'
                : 'Encode the whole batch with the current settings.'}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Download all as ZIP"
          onClick={handleDownloadZip}
          disabled={doneCount === 0 || zipping}
          className="btn-ghost"
        >
          {zipping ? 'Preparing ZIP…' : 'Download all as ZIP'}
        </button>
        <button
          type="button"
          aria-label="Optimize all"
          onClick={() => optimizer.optimizeAll()}
          disabled={processing || imageCount === 0}
          className="btn-primary"
        >
          {processing ? 'Optimizing…' : 'Optimize all'}
          <span className="btn-primary-orb">
            <BoltGlyph />
          </span>
        </button>
      </div>

      <div className="flex h-[27px] flex-col justify-between">
        {batch.total > 0 ? (
          <div className="flex animate-fade-in flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-ink-faint">
            <span data-testid="batch-status-label" className="flex items-center gap-2">
              {processing ? (
                <span aria-hidden="true" className="size-1.5 animate-breathe rounded-full bg-ember" />
              ) : null}
              {complete ? (errorCount > 0 ? 'Complete with errors' : 'Complete') : 'Optimizing'}
            </span>
            <span className="flex items-center gap-3 font-mono">
              {errorCount > 0 ? (
                <span data-testid="batch-error-count" className="text-clay">
                  {errorCount} failed
                </span>
              ) : null}
              <span data-testid="batch-counter" className="text-ink-dim">
                {batch.completed} / {batch.total}
              </span>
              <span data-testid="batch-percent" className="tabular-nums">
                {percent}%
              </span>
            </span>
          </div>
          <div
            data-testid="batch-progress"
            role="progressbar"
            aria-valuenow={batch.completed}
            aria-valuemin={0}
            aria-valuemax={batch.total}
            aria-label="Batch progress"
            className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]"
          >
            <div
              className="relative h-full overflow-hidden rounded-full bg-linear-to-r from-ember-deep to-ember transition-[width] duration-500 ease-fluid"
              style={{ width: `${Math.round(progress * 100)}%` }}
            >
              {processing ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/40 to-transparent"
                />
              ) : null}
            </div>
            <span className="sr-only">
              {batch.completed} / {batch.total}
            </span>
          </div>
          </div>
        ) : (
          <>
            <div aria-hidden="true" />
            <div aria-hidden="true" className="h-[3px] w-full rounded-full bg-white/[0.05]" />
          </>
        )}
      </div>
    </section>
  )
}
