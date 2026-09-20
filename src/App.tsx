import Dropzone from "./components/Dropzone";
import ImageGrid from "./components/ImageGrid";
import SettingsPanel from "./components/SettingsPanel";
import CropControls from "./components/CropControls";
import ResizeControls from "./components/ResizeControls";
import BatchToolbar from "./components/BatchToolbar";
import CompareSlider from "./components/CompareSlider";
import CropEditorModal from "./components/CropEditorModal";
import { useImagenStore } from "./store/useImagenStore";

export default function App() {
  const hasImages = useImagenStore((state) => state.images.length > 0);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-100 rounded-full bg-ink px-4 py-2 text-sm font-medium text-well focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <header className="mx-auto flex w-full max-w-6xl items-baseline justify-between px-6 pt-8 sm:px-8">
        <h1 className="font-display text-3xl italic tracking-tight">
          Imagen
          <span
            aria-hidden="true"
            className="ml-1.5 inline-block size-1.5 rounded-full bg-ember"
          />
        </h1>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 sm:px-8">
        {hasImages ? (
          <div className="flex flex-col gap-5 pt-8 pb-20">
            <Dropzone />
            <div
              className="bezel animate-rise"
              style={{ animationDelay: "60ms" }}
            >
              <div className="bezel-core divide-y divide-white/[0.06] overflow-hidden bg-canvas/50 ring-1 ring-white/[0.04]">
                <SettingsPanel />
                <CropControls />
                <ResizeControls />
                <BatchToolbar />
              </div>
            </div>
            <CompareSlider />
            <CropEditorModal />
            <ImageGrid />
          </div>
        ) : (
          <section className="flex flex-col items-center pt-16 pb-24 text-center sm:pt-24">
            <h2
              className="mt-8 max-w-3xl animate-rise text-5xl font-medium tracking-[-0.03em] sm:text-[4.5rem] sm:leading-[1.04]"
              style={{ animationDelay: "70ms" }}
            >
              Compress images
              <br />
              <span className="font-display font-normal text-ink-dim italic">
                in your browser.
              </span>
            </h2>
            <div
              className="mt-14 w-full max-w-3xl animate-rise"
              style={{ animationDelay: "210ms" }}
            >
              <Dropzone />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
