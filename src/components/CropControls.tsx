import { useImagenStore } from '../store/useImagenStore'
import RatioPicker from './RatioPicker'

export default function CropControls() {
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const setGlobalCrop = useImagenStore((state) => state.setGlobalCrop)
  const openCropEditor = useImagenStore((state) => state.openCropEditor)
  const firstImageId = useImagenStore((state) => state.images[0]?.id ?? null)
  const processing = useImagenStore((state) => state.batch.status === 'processing')

  return (
    <section
      data-testid="crop-controls"
      className="flex flex-wrap items-end gap-x-10 gap-y-5 px-5 py-5 sm:px-6"
    >
      <RatioPicker
        label="Crop"
        idPrefix="crop"
        value={globalCrop}
        disabled={processing}
        onChange={(ratio) => setGlobalCrop(ratio ?? { kind: 'none' })}
      />

      {globalCrop.kind !== 'none' && firstImageId != null ? (
        <button
          type="button"
          data-testid="crop-adjust-button"
          disabled={processing}
          onClick={() => openCropEditor(firstImageId)}
          className="btn-ghost h-9 px-4 text-xs"
        >
          Adjust crops
        </button>
      ) : null}

      {globalCrop.kind === 'ratio' ? (
        <p className="basis-full text-xs leading-relaxed text-ink-faint">
          Every image gets a centered {globalCrop.w}:{globalCrop.h} crop. Use “Adjust crops” to
          reposition each one.
        </p>
      ) : null}
    </section>
  )
}
