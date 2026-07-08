import { useEffect } from 'react'
import Dropzone from './components/Dropzone'
import ImageGrid from './components/ImageGrid'
import BatchToolbar from './components/BatchToolbar'
import { useImagenStore } from './store/useImagenStore'

export default function App() {
  const hasImages = useImagenStore((state) => state.images.length > 0)

  useEffect(() => {
    document.title = 'Imagen'
  }, [])

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">Imagen</h1>
        <p className="text-sm text-slate-400">
          Batch image optimizer that runs entirely in your browser.
        </p>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <Dropzone />
        {hasImages ? (
          <>
            <BatchToolbar />
            <ImageGrid />
          </>
        ) : null}
      </div>
    </main>
  )
}
