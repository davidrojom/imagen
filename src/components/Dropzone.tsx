import { useCallback, useRef, useState } from 'react'
import { useImagenStore } from '../store/useImagenStore'
import { isImageFile } from '../lib/imageFiles'

const INPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'jxl', 'gif']

function ImageGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4.5" />
      <circle cx="9" cy="9" r="1.75" />
      <path d="m3 16.5 4.6-4.6a1.9 1.9 0 0 1 2.7 0l5.2 5.2" />
      <path d="m14 15 1.8-1.8a1.9 1.9 0 0 1 2.7 0L21 15.7" />
    </svg>
  )
}

function ArrowGlyph() {
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
      <path d="M2.5 8h10m0 0L8.75 4.25M12.5 8l-3.75 3.75" />
    </svg>
  )
}

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

  const openPicker = () => inputRef.current?.click()

  return (
    <div
      data-testid="dropzone"
      data-dragging={dragging}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Add images"
      className={hasImages ? 'animate-rise' : 'bezel'}
    >
      <div
        className={[
          'border border-dashed transition-all duration-300 ease-fluid',
          hasImages
            ? 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl px-5 py-4'
            : 'bezel-core flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20',
          dragging
            ? 'border-ember/60 bg-ember/[0.05]'
            : 'border-white/[0.1] bg-canvas/40 hover:border-white/[0.2]',
        ].join(' ')}
      >
        {hasImages ? (
          <>
            <div className="flex min-w-0 items-center gap-4">
              <span
                className={[
                  'flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ease-fluid',
                  dragging
                    ? 'border-ember/40 bg-ember/10 text-ember'
                    : 'border-white/[0.08] bg-white/[0.04] text-ink-dim',
                ].join(' ')}
              >
                <ImageGlyph className="size-5" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium">Add more images</p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  Drop more files anywhere in this area — everything stays on your device.
                </p>
              </div>
            </div>
            <button type="button" onClick={openPicker} className="btn-ghost h-9 px-4 text-xs">
              Choose images
            </button>
          </>
        ) : (
          <>
            <span
              className={[
                'flex size-13 items-center justify-center rounded-2xl border transition-all duration-300 ease-fluid',
                dragging
                  ? '-translate-y-1 border-ember/40 bg-ember/10 text-ember'
                  : 'border-white/[0.08] bg-white/[0.04] text-ink-dim',
              ].join(' ')}
            >
              <ImageGlyph />
            </span>
            <p className="mt-6 text-lg font-medium">
              {dragging ? 'Drop them right here' : 'Drag & drop images here'}
            </p>
            <p className="mt-1.5 text-sm text-ink-faint">
              or pick files from disk
            </p>
            <button type="button" onClick={openPicker} className="btn-primary mt-7">
              Choose images
              <span className="btn-primary-orb">
                <ArrowGlyph />
              </span>
            </button>
            <ul className="mt-9 flex flex-wrap items-center justify-center gap-1.5">
              {INPUT_FORMATS.map((format) => (
                <li key={format} className="chip">
                  {format}
                </li>
              ))}
            </ul>
          </>
        )}
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
    </div>
  )
}
