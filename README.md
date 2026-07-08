# Imagen

A batch image optimizer that runs entirely in your browser. Drop in your images, pick a format and quality, and get smaller files back. Nothing gets uploaded anywhere.

Most online image compressors send your photos to a server. Imagen does all the work on your own machine using the same WebAssembly codecs that power [Squoosh](https://squoosh.app), so it's private by design and keeps working even without a connection.

## What it does

- Optimizes whole batches at once: drag in as many images as you want
- Converts between JPEG, WebP, AVIF, PNG and JPEG XL
- Resizes to fixed dimensions or by percentage
- Shows a before/after comparison with a draggable slider
- Lets you tweak settings globally or per image
- Downloads results individually or all together as a ZIP
- Installs as an app and works fully offline

Everything runs in background workers, so the interface stays smooth even while crunching a big batch.

## Privacy

Your images never leave your device. There is no server, no account, no analytics, and EXIF metadata is stripped from every output.

## Try it locally

```bash
npm install
npm run dev
```

Requires Node 20.19+ or 22.12+. `npm run build` produces a plain static site you can host anywhere, and there's a Dockerfile if you prefer containers.
