import { useState } from 'react'
import { useImagenStore, selectBatchProgress, selectDoneCount } from '../store/useImagenStore'
import { getOptimizer, type OptimizerLike } from '../codec/optimizer'
import { downloadImagesZip } from '../lib/zip'

export default function BatchToolbar({
  optimizer = getOptimizer(),
}: {
  optimizer?: OptimizerLike
}) {
  const imageCount = useImagenStore((state) => state.images.length)
  const batch = useImagenStore((state) => state.batch)
  const progress = useImagenStore(selectBatchProgress)
  const doneCount = useImagenStore(selectDoneCount)
  const [zipping, setZipping] = useState(false)

  const processing = batch.status === 'processing'
  const complete = batch.status === 'done' && batch.total > 0

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
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <button
          type="button"
          aria-label="Download all as ZIP"
          onClick={handleDownloadZip}
          disabled={doneCount === 0 || zipping}
          className="ml-auto rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {zipping ? 'Preparing ZIP…' : 'Download all as ZIP'}
        </button>
        <button
          type="button"
          aria-label="Optimize all"
          onClick={() => optimizer.optimizeAll()}
          disabled={processing || imageCount === 0}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
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
