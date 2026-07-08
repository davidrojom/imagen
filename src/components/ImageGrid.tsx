import { useImagenStore } from '../store/useImagenStore'
import ImageCard from './ImageCard'

export default function ImageGrid() {
  const images = useImagenStore((state) => state.images)
  const clearAll = useImagenStore((state) => state.clearAll)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">
          {images.length} {images.length === 1 ? 'image' : 'images'}
        </h2>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800"
        >
          Clear all
        </button>
      </div>
      <ul
        data-testid="image-grid"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      >
        {images.map((item) => (
          <ImageCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}
