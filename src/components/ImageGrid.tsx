import { useImagenStore } from '../store/useImagenStore'
import ImageCard from './ImageCard'

export default function ImageGrid() {
  const images = useImagenStore((state) => state.images)
  const clearAll = useImagenStore((state) => state.clearAll)

  return (
    <section className="mt-3 flex flex-col gap-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm text-ink-dim">
          <span className="font-mono text-ink">{images.length}</span>{' '}
          {images.length === 1 ? 'image' : 'images'} in the batch
        </h2>
        <button type="button" onClick={clearAll} className="btn-quiet">
          Clear all
        </button>
      </div>
      <ul
        data-testid="image-grid"
        className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {images.map((item, index) => (
          <ImageCard key={item.id} item={item} index={index} />
        ))}
      </ul>
    </section>
  )
}
