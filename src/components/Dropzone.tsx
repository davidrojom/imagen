import { useCallback, useRef, useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { isImageFile } from '../lib/imageFiles'

export default function Dropzone() {
  const addFiles = useImagenStore((state) => state.addFiles)
  const hasImages = useImagenStore((state) => state.images.length > 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const ingest = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const images = Array.from(files).filter(isImageFile)
      if (images.length > 0) addFiles(images)
    },
    [addFiles],
  )

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      ingest(event.dataTransfer?.files ?? null)
    },
    [ingest],
  )

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      ingest(event.target.files)
      event.target.value = ''
    },
    [ingest],
  )

  return (
    <div
      data-testid="dropzone"
      data-dragging={dragging}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Add images"
      className={[
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
        hasImages ? 'gap-2 px-6 py-6' : 'gap-3 px-6 py-16',
        dragging
          ? 'border-sky-400 bg-sky-500/10'
          : 'border-slate-700 bg-slate-800/40 hover:border-slate-500',
      ].join(' ')}
    >
      <p className="text-lg font-medium text-slate-100">
        {hasImages ? 'Add more images' : 'Drag & drop images here'}
      </p>
      <p className="text-sm text-slate-400">
        {hasImages
          ? 'Drop more files or choose them below. Everything stays on your device.'
          : 'or choose files to optimize. Images never leave your browser.'}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400"
      >
        Choose images
      </button>
      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.jxl"
        multiple
        onChange={onChange}
        className="hidden"
      />
    </div>
  )
}
