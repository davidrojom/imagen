# Imagen

Imagen is a **client-side batch image optimizer** that runs entirely in the browser. Drop in many images at once, pick an output format and quality, and Imagen decodes, optionally resizes, and re-encodes them locally. There is **no backend**: images never leave the device, no uploads happen, and EXIF/metadata is stripped as a side effect of decoding to raw pixels.

All heavy work (decode, resize, encode) runs in a pool of Web Workers using the WebAssembly codecs from [jSquash](https://github.com/jamsinclair/jSquash) (the same codecs Squoosh uses, packaged for the browser), so the UI stays responsive during batch processing.

## Features

- Multi-file drag-and-drop and file picker, with a grid showing per-image thumbnail, original/optimized size, and % saved.
- Five output encoders: **MozJPEG**, **WebP**, **AVIF**, **PNG (OxiPNG)**, and **JPEG XL**, with format-aware quality / optimization-level controls.
- Optional resizing (fit to dimensions keeping aspect ratio, or by percentage).
- Global settings plus per-image overrides, with re-optimization on change.
- Before/after compare view with a draggable slider.
- Batch "Optimize all", individual downloads, and "Download all as ZIP" (via `client-zip`, STORE mode, no recompression).
- Global batch progress and per-image error handling.
- Installable, fully **offline-capable PWA** (app shell and codec WASM are precached).

## Tech stack

- **React 19** + **TypeScript 6**, bundled with **Vite 8**.
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (single `@import "tailwindcss";`, no `tailwind.config`, no PostCSS).
- **Zustand** for state, **Comlink** for worker RPC, **client-zip** for ZIP export.
- **jSquash** WASM codecs (`@jsquash/jpeg` `png` `webp` `avif` `jxl` `resize` `oxipng`).
- **vite-plugin-pwa** (Workbox) for offline support and installability.
- **Vitest** + **React Testing Library** (jsdom) for unit/component/integration tests; **ESLint 9** (flat config).

## Prerequisites

- **Node.js 20 or newer** and **npm** (the app is verified on Node 20; the Docker build uses Node 22).
- No credentials, environment variables, or external services are required.

## Setup

```bash
npm install
```

## Commands

| Task | Command | Notes |
| --- | --- | --- |
| Start dev server | `npm run dev` | Vite dev server on http://localhost:5173 |
| Production build | `npm run build` | Runs `tsc --noEmit` then `vite build` into `dist/` |
| Preview the build | `npm run preview` | Serves `dist/` on http://localhost:4173 |
| Type-check | `npm run typecheck` | `tsc --noEmit` |
| Lint | `npm run lint` | `eslint .` |
| Test | `npm run test` | `vitest run` (headless, no watch) |
| Regenerate fixtures | `npm run fixtures` | Rebuilds the committed test images in `test/fixtures/` |

### Develop

```bash
npm run dev        # http://localhost:5173
```

### Build & preview

```bash
npm run build      # outputs dist/
npm run preview    # serves the production build on http://localhost:4173
```

The PWA service worker and codec WASM only behave like production when served from a real HTTP server, so use `npm run preview` (not `file://`) to test offline/installability.

### Test & lint

```bash
npm run typecheck
npm run lint
npm run test
```

## How it works

Imagen is a React SPA where **all pixel processing happens in Web Workers**; the main thread only handles UI and state.

- Decode uses the browser's native `createImageBitmap` + `OffscreenCanvas` to produce raw RGBA (which also drops EXIF metadata), with a jSquash decoder fallback for JPEG XL.
- Codec logic lives in a pure, testable module (`src/codec/codecApi.ts`); the worker is a thin `Comlink.expose` shell.
- A worker pool (roughly `cores - 1` workers) queues tasks and transfers `ArrayBuffer`s (zero-copy) to keep the UI responsive.
- Codecs run **single-threaded by default**, so the app works on any host. Cross-origin isolation (COOP/COEP) is an optional progressive enhancement that unlocks multithreaded AVIF/JXL/OxiPNG encoding when available; the app functions correctly when `crossOriginIsolated === false`.

## Deployment

Imagen builds to fully static assets (`dist/`) and can be served by any static host or CDN.

### Docker + nginx

A multi-stage [`Dockerfile`](./Dockerfile) builds the app with Node and serves the static output with nginx using the bundled [`nginx.conf`](./nginx.conf):

```bash
docker build -t imagen .
docker run --rm -p 8080:80 imagen
# open http://localhost:8080
```

The included `nginx.conf` provides:

- **SPA fallback** (`try_files $uri $uri/ /index.html`) for client-side routing.
- Correct **`application/wasm`** MIME type for the codec WASM.
- **Long-cache, immutable** headers for content-hashed `/assets/`, and **no-cache** for `sw.js`, `index.html`, and `manifest.webmanifest` so PWA updates land promptly.
- **COOP/COEP** headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) as an optional enhancement. All assets are same-origin, so `require-corp` does not break any request.

### Static hosting

Because the output is plain static files, you can deploy `dist/` to Netlify, Vercel, GitHub Pages, S3/CloudFront, or any static server. Two things to configure on the host:

1. **SPA fallback**: rewrite unknown routes to `/index.html`.
2. **WASM MIME type**: ensure `.wasm` files are served as `application/wasm` (most modern hosts do this automatically).

**Optional cross-origin isolation:** to enable multithreaded encoding, send these response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are purely additive. Imagen works fine without them (single-threaded codecs), so omit them if your host makes them awkward to set.

## Privacy

No image ever leaves the browser. There is no analytics or telemetry, and EXIF/metadata is always stripped from outputs.
