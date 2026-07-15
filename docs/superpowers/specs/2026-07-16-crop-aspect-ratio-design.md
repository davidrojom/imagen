# Crop & Aspect Ratio — Design

**Date:** 2026-07-16
**Status:** Approved

## Summary

Add interactive cropping to Imagen: crop a single image or the whole batch with a
resizable, draggable overlay, optionally locked to a fixed aspect ratio. Setting a
batch ratio auto-crops every image (centered, maximum area); a crop editor lets the
user step through images and tweak each crop individually. Crops are non-destructive
and applied in the worker pipeline before resize and encode.

## Requirements

- Crop one image or many at once using a resizable/draggable overlay.
- Adjust the aspect ratio of all images: choosing a ratio shows a fixed-ratio,
  resizable, draggable overlay per image; the image is cropped to the selection.
- Prioritize user experience: immediate visual feedback, per-image control, and
  predictable batch behavior.

## Decisions

| Decision | Choice |
|---|---|
| Batch semantics | Ratio + per-image tweak: one ratio seeds auto-centered crops on all images; editor allows per-image adjustment |
| Entry points | Global "Crop" control in settings bar **and** per-card crop button |
| Ratio options | Free + presets (1:1, 4:3, 3:2, 16:9, 9:16) + custom W:H |
| Overlay implementation | `react-image-crop` library (chosen over hand-built and react-easy-crop) |
| Ratio change behavior | Clean slate: changing the batch ratio clears all per-image rects **and** per-image ratio overrides, re-seeding centered crops |
| Editor save model | Live-apply: edits write to state immediately; "Done" just closes |
| Result invalidation | None (consistent with app): changing a crop keeps the old result; user re-optimizes |

## UX & interaction flow

### Global Crop control

A new **Crop** group in the global settings bezel (next to Resize) with a ratio
selector: `None · Free · 1:1 · 4:3 · 3:2 · 16:9 · 9:16 · Custom`.

- **None** (default): no cropping; current behavior.
- **Ratio**: every image immediately gets an automatic centered maximum-area crop at
  that ratio. Card thumbnails preview the crop instantly. An **"Adjust crops"**
  button appears next to the selector (visible whenever ratio ≠ None).
- **Free**: no automatic crop; enables freeform (unlocked) cropping of individual
  images in the editor.
- **Custom**: two positive-integer inputs (W : H).

All crop controls are disabled while a batch is processing.

### Crop editor (modal)

Opened via "Adjust crops" or the per-card crop button (which opens focused on that
image). An accessible dialog (focus trap, Esc closes):

- Large preview with the `react-image-crop` resizable/draggable overlay, locked to
  the effective ratio (unlocked when Free), rule-of-thirds guides on, minimum crop
  size 16 natural px (clamped to the image size for smaller images).
- **Filmstrip** of all batch images below with prev/next arrows, arrow-key
  navigation, and an image counter ("3 of 12"). Each thumb previews its crop.
- **Per-image ratio row** defaulting to "Batch (16:9)" with overrides
  (None / Free / presets / custom) for the current image only — mirrors the
  existing global/per-image settings override pattern, including the card
  "Custom" badge. None leaves this image uncropped while the batch is cropped.
- **Reset** returns the current image to the auto-centered crop.
- Edits apply live to store state; no separate save step.

### Image cards

- Thumbnail shows the cropped preview via a CSS `object-fit`/transform wrapper
  (no main-thread canvas work).
- Small badge showing the crop ratio when a crop is active.
- Crop icon button (top-left, mirroring the existing remove button placement)
  opens the editor at that image.

### Compare slider

The "before" side renders the original with the same CSS crop transform, so the
before/after halves stay pixel-aligned and the divider comparison remains
meaningful.

## Data model & state

### Types (`src/types.ts`)

```ts
export interface CropRect { x: number; y: number; width: number; height: number } // px, source coords

export type CropRatio =
  | { kind: 'none' }                         // no cropping
  | { kind: 'free' }                         // freeform, no auto-crop
  | { kind: 'ratio'; w: number; h: number }  // presets and custom both land here

export interface CropSettings {
  ratio?: CropRatio // per-image override; absent = follow the batch ratio
  rect?: CropRect   // manual rect from the editor; absent = auto-centered
}
```

### Store (`src/store/useImagenStore.ts`)

- `globalCrop: CropRatio` — new top-level field (not inside `EncodeSettings`,
  because pixel rects don't merge the way format/quality settings do).
- `ImageItem.crop?: CropSettings` — per-image manual rect and/or ratio override.
  Absent → follow `globalCrop` with an auto-centered rect.
- `setGlobalCrop(ratio)` — sets the batch ratio and clears every image's `crop`
  entirely (clean-slate rule).
- `setImageCrop(id, crop | null)` — set or clear one image's crop
  (null = back to batch default).
- `clearAll()` also resets `globalCrop` to `{ kind: 'none' }`.

### Crop math (`src/lib/cropMath.ts`, pure, unit-tested)

- `centeredCrop(dims, ratio): CropRect` — maximum-area centered crop.
- `clampRect(rect, dims): CropRect` — clamp to image bounds, minimum 1×1,
  integer pixels.
- `effectiveCrop(item, globalCrop): CropRect | undefined` — resolves what the
  pipeline uses.
- Display↔natural coordinate conversion helpers for the editor.

## Processing pipeline

- `EncodeSettings` (worker-facing snapshot) gains
  `crop?: { rect?: CropRect; ratio?: { w: number; h: number } }`. The optimizer
  resolves each image's effective crop into the snapshot at optimize time (same
  snapshot mechanism as today).
- Worker (`codecApi.processImage`), after decode:
  1. If `crop.rect` exists → clamp to decoded bounds and crop.
  2. Else if `crop.ratio` exists → compute a centered crop from decoded
     dimensions (fallback for images whose dimensions hadn't loaded in the UI).
  3. A crop equal to the full image is a no-op (skip the copy).
- Cropping `ImageData` is a pure row-copy function — no canvas needed.
- Order: **decode → crop → resize → encode**. Percentage/dimension resize applies
  to the cropped size; the resize hint and card target labels reflect this.
- `ProcessResult` already reports final width/height — cards and ZIP unchanged.

## Components

| Component | Change |
|---|---|
| `CropControls.tsx` (new) | Ratio select, custom W:H inputs, "Adjust crops" button |
| `CropEditorModal.tsx` (new) | Dialog with `<ReactCrop>`, per-image ratio row, Reset, filmstrip |
| `ImageCard.tsx` | Cropped thumbnail preview, ratio badge, crop button |
| `CompareSlider.tsx` | Crop-aligned "before" side |
| `useImagenStore.ts` | `globalCrop`, `setGlobalCrop`, `setImageCrop`, `clearAll` reset |
| `index.css` | Restyle react-image-crop selection border/handles with design tokens (ember accent, existing ring/rounded idiom) |

**Dependency:** `react-image-crop` ^11.x — zero transitive deps, ~5 kB gzipped, MIT.
Crop state converted display↔natural px via `cropMath`; store integer natural-pixel
rects.

## Edge cases

- Ratio more extreme than the image (e.g. 16:9 on a tall image) → centered
  max-area crop yields a full-width band.
- Custom ratio inputs: positive integers only; invalid input falls back to last
  valid value; empty keeps current.
- Image dimensions not yet loaded when the editor opens → show the existing
  shimmer loading state until the `<img>` loads.
- Editor rounds rects to integer pixels; worker clamps defensively.
- Images smaller than the minimum crop size → min-size clamps to image size.

## Testing

Colocated `*.test.ts(x)` per project convention:

- `cropMath.test.ts` — centered crops across ratios/orientations, clamping,
  rounding, coordinate conversion.
- `codecApi.test.ts` — crop step output dimensions/pixels, crop+resize order,
  ratio fallback path, full-image no-op.
- `useImagenStore.test.ts` — new actions, clean-slate rule, `clearAll` reset.
- `CropControls.test.tsx`, `CropEditorModal.test.tsx` — rendering, ratio
  switching, reset, filmstrip navigation (react-image-crop exercised at the
  props/callback level).
- `ImageCard.test.tsx`, `CompareSlider.test.tsx` — badge, crop button, aligned
  before-side.

## Out of scope

- Rotation/straightening, flipping.
- Zoom/pan editing paradigm (react-easy-crop style).
- Saving crop presets across sessions.
- Auto-invalidation of stale results after crop changes.
