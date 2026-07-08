import Dropzone from "./components/Dropzone";
import ImageGrid from "./components/ImageGrid";
import SettingsPanel from "./components/SettingsPanel";
import ResizeControls from "./components/ResizeControls";
import BatchToolbar from "./components/BatchToolbar";
import CompareSlider from "./components/CompareSlider";
import { useImagenStore } from "./store/useImagenStore";

const FEATURES = [
  {
    title: "Native-grade codecs",
    body: "MozJPEG, Oxipng, libavif and libjxl compiled to WebAssembly, running right in this tab.",
  },
  {
    title: "Built for batches",
    body: "Drop dozens of files at once, tune each one individually and export everything as a single ZIP.",
  },
  {
    title: "Works offline",
    body: "Install it as an app and keep optimizing in airplane mode. There is no server to reach.",
  },
];

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
                <ResizeControls />
                <BatchToolbar />
              </div>
            </div>
            <CompareSlider />
            <ImageGrid />
          </div>
        ) : (
          <section className="flex flex-col items-center pt-16 pb-24 text-center sm:pt-24">
            <h2
              className="mt-8 max-w-3xl animate-rise text-5xl font-medium tracking-[-0.03em] sm:text-[4.5rem] sm:leading-[1.04]"
              style={{ animationDelay: "70ms" }}
            >
              Compress everything.
              <br />
              <span className="font-display font-normal text-ink-dim italic">
                Upload nothing.
              </span>
            </h2>
            <p
              className="mt-7 max-w-xl animate-rise text-base leading-relaxed text-ink-dim"
              style={{ animationDelay: "140ms" }}
            >
              Batch-convert images to AVIF, WebP, JPEG&nbsp;XL, PNG or JPEG with
              WebAssembly codecs that run entirely on your device — fast, free
              and fully offline.
            </p>
            <div
              className="mt-14 w-full max-w-3xl animate-rise"
              style={{ animationDelay: "210ms" }}
            >
              <Dropzone />
            </div>
            <ul
              className="mt-20 grid w-full max-w-4xl animate-rise grid-cols-1 gap-x-10 gap-y-10 text-left sm:grid-cols-3"
              style={{ animationDelay: "280ms" }}
            >
              {FEATURES.map((feature) => (
                <li
                  key={feature.title}
                  className="border-t border-white/[0.08] pt-5"
                >
                  <h3 className="text-sm font-medium">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-faint">
                    {feature.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="flex flex-col gap-3 border-t border-white/[0.07] py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-faint">
            Every image is processed on this device. No uploads, no analytics,
            no servers.
          </p>
          <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">
            avif · webp · jxl · png · jpeg
          </p>
        </div>
      </footer>
    </div>
  );
}
