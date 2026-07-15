# Crop & Aspect Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interactive cropping for Imagen — batch aspect-ratio crops with auto-centered defaults, a modal editor with a resizable/draggable overlay (react-image-crop) and filmstrip, per-image tweaks/overrides, applied in the worker pipeline before resize.

**Architecture:** Crop state splits between a store-level `globalCrop` ratio (seeds auto-centered crops on every image) and per-image `ImageItem.crop` overrides (manual rect and/or ratio override). Pure geometry lives in `src/lib/cropMath.ts`. The optimizer injects a resolved crop into the per-image settings snapshot; the worker crops `ImageData` (pure row-copy) between decode and resize and reports the applied rect back so the UI (compare slider) can align previews. UI: a global `CropControls` group, a `CropEditorModal` built on react-image-crop (controlled with percent crops, converted to natural-pixel rects for storage), cropped thumbnail previews via pure CSS-style computation.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind 4, Vitest + Testing Library (jsdom), react-image-crop v11 (new dependency), @jsquash codecs in workers.

**Spec:** `docs/superpowers/specs/2026-07-16-crop-aspect-ratio-design.md`

## Global Constraints

- Node 20.19+ or 22.12+; run commands from the repo root `/Users/david.rojo/personal/imagen`.
- Dependencies are pinned exact in package.json (no `^`/`~`) — install with `npm install --save-exact`.
- Tests are colocated: `foo.ts` → `foo.test.ts`, components `Foo.tsx` → `Foo.test.tsx`.
- `data-testid` values are kebab-case; interactive elements get aria-labels like the existing components.
- Verification commands: `npm test` (vitest run), `npm run typecheck`, `npm run lint`, `npm run build`.
- TDD: write the failing test first, watch it fail, implement, watch it pass, commit.
- All crop rects are integer pixels in **natural (source) image coordinates**. Minimum crop size is 16 px per side, clamped to the image size for smaller images (`MIN_CROP_PX` in cropMath).
- Predictability rule: `setGlobalCrop` clears **all** per-image crop state (rects and ratio overrides).
- Changing a crop does NOT invalidate existing results (consistent with the rest of the app — user re-optimizes).

---

### Task 1: Crop types + cropMath module

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/cropMath.ts`
- Test: `src/lib/cropMath.test.ts`

**Interfaces:**
- Consumes: `Dimensions` from `src/lib/resizeMath.ts` (`{ width: number; height: number }`).
- Produces (used by every later task):
  - Types in `src/types.ts`: `CropRect { x, y, width, height }` (all `number`), `CropRatio = { kind: 'none' } | { kind: 'free' } | { kind: 'ratio'; w: number; h: number }`, `CropSettings { ratio?: CropRatio; rect?: CropRect }`, `ImageItem.crop?: CropSettings`, `EncodeSettings.crop?: { rect?: CropRect; ratio?: { w: number; h: number } }`, `ImageResult.cropRect?: CropRect`.
  - Functions in `src/lib/cropMath.ts`:
    - `MIN_CROP_PX = 16`
    - `ratioValue(ratio: CropRatio | undefined): number | undefined`
    - `ratioLabel(ratio: CropRatio): string`
    - `centeredCrop(dims: Dimensions, ratio: { w: number; h: number }): CropRect`
    - `clampRect(rect: CropRect, dims: Dimensions): CropRect`
    - `isFullImage(rect: CropRect, dims: Dimensions): boolean`
    - `effectiveRatio(crop: CropSettings | undefined, globalCrop: CropRatio): CropRatio`
    - `effectiveCropRect(crop: CropSettings | undefined, globalCrop: CropRatio, dims: Dimensions): CropRect | undefined`
    - `cropSnapshot(crop: CropSettings | undefined, globalCrop: CropRatio): { rect?: CropRect; ratio?: { w: number; h: number } } | undefined`
    - `resolveCropRect(dims: Dimensions, crop: { rect?: CropRect; ratio?: { w: number; h: number } } | undefined): CropRect | undefined`
    - `rectToPercent(rect: CropRect, dims: Dimensions): PercentRect` and `percentToRect(pct: PercentRect, dims: Dimensions): CropRect` where `PercentRect { x, y, width, height }` is 0–100.

- [ ] **Step 1: Add the crop types to `src/types.ts`**

Append after the `ResizeSettings` interface:

```ts
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type CropRatio =
  | { kind: 'none' }
  | { kind: 'free' }
  | { kind: 'ratio'; w: number; h: number }

export interface CropSettings {
  ratio?: CropRatio // per-image override; absent = follow the batch ratio
  rect?: CropRect // manual rect from the editor; absent = auto-centered
}
```

Extend `EncodeSettings` (the worker-facing snapshot carries the resolved crop):

```ts
export interface EncodeSettings {
  format: OutputFormat
  quality?: number
  effort?: number
  resize: ResizeSettings
  crop?: { rect?: CropRect; ratio?: { w: number; h: number } }
}
```

Extend `ImageResult` with the rect the worker actually applied (for the compare slider):

```ts
export interface ImageResult {
  blob: Blob
  url: string
  outputType: string
  outputBytes: number
  width: number
  height: number
  outputName: string
  cropRect?: CropRect
}
```

Extend `ImageItem`:

```ts
export interface ImageItem {
  id: string
  file: File
  name: string
  sourceType: string
  originalBytes: number
  originalWidth?: number
  originalHeight?: number
  previewUrl: string
  settings: EncodeSettings | null
  crop?: CropSettings
  status: ImageStatus
  progress?: number
  result?: ImageResult
  error?: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/cropMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MIN_CROP_PX,
  centeredCrop,
  clampRect,
  cropSnapshot,
  effectiveCropRect,
  effectiveRatio,
  isFullImage,
  percentToRect,
  ratioLabel,
  ratioValue,
  rectToPercent,
  resolveCropRect,
} from './cropMath'
import type { CropRatio } from '../types'

const landscape = { width: 1600, height: 900 }
const portrait = { width: 900, height: 1600 }

const none: CropRatio = { kind: 'none' }
const free: CropRatio = { kind: 'free' }
const sixteenNine: CropRatio = { kind: 'ratio', w: 16, h: 9 }
const square: CropRatio = { kind: 'ratio', w: 1, h: 1 }

describe('ratioValue / ratioLabel', () => {
  it('returns w/h only for ratio kind', () => {
    expect(ratioValue(sixteenNine)).toBeCloseTo(16 / 9)
    expect(ratioValue(none)).toBeUndefined()
    expect(ratioValue(free)).toBeUndefined()
    expect(ratioValue(undefined)).toBeUndefined()
  })

  it('labels every kind', () => {
    expect(ratioLabel(none)).toBe('None')
    expect(ratioLabel(free)).toBe('Free')
    expect(ratioLabel(sixteenNine)).toBe('16:9')
  })
})

describe('centeredCrop', () => {
  it('returns the full image when the ratio matches exactly', () => {
    expect(centeredCrop(landscape, { w: 16, h: 9 })).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })

  it('pillarboxes a square crop of a landscape image', () => {
    expect(centeredCrop(landscape, { w: 1, h: 1 })).toEqual({ x: 350, y: 0, width: 900, height: 900 })
  })

  it('letterboxes a 16:9 crop of a portrait image (full-width band)', () => {
    const crop = centeredCrop(portrait, { w: 16, h: 9 })
    expect(crop.width).toBe(900)
    expect(crop.height).toBe(506)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(547)
  })

  it('never exceeds the image bounds after rounding', () => {
    const dims = { width: 3, height: 5 }
    const crop = centeredCrop(dims, { w: 16, h: 9 })
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(dims.width)
    expect(crop.y + crop.height).toBeLessThanOrEqual(dims.height)
  })
})

describe('clampRect', () => {
  it('passes through an in-bounds rect, rounding to integers', () => {
    expect(clampRect({ x: 10.4, y: 20.6, width: 100.2, height: 50.5 }, landscape)).toEqual({
      x: 10,
      y: 21,
      width: 100,
      height: 51,
    })
  })

  it('clamps a rect that overflows right/bottom by moving it back in bounds', () => {
    expect(clampRect({ x: 1550, y: 850, width: 100, height: 100 }, landscape)).toEqual({
      x: 1500,
      y: 800,
      width: 100,
      height: 100,
    })
  })

  it('clamps negative origins to zero', () => {
    expect(clampRect({ x: -5, y: -5, width: 100, height: 100 }, landscape)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it(`enforces the ${MIN_CROP_PX}px minimum side`, () => {
    const clamped = clampRect({ x: 0, y: 0, width: 2, height: 2 }, landscape)
    expect(clamped.width).toBe(MIN_CROP_PX)
    expect(clamped.height).toBe(MIN_CROP_PX)
  })

  it('caps the minimum at the image size for tiny images', () => {
    const clamped = clampRect({ x: 0, y: 0, width: 1, height: 1 }, { width: 8, height: 8 })
    expect(clamped).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('shrinks an oversized rect to the image', () => {
    expect(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, landscape)).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 900,
    })
  })
})

describe('isFullImage', () => {
  it('detects the identity crop', () => {
    expect(isFullImage({ x: 0, y: 0, width: 1600, height: 900 }, landscape)).toBe(true)
    expect(isFullImage({ x: 0, y: 0, width: 1599, height: 900 }, landscape)).toBe(false)
    expect(isFullImage({ x: 1, y: 0, width: 1599, height: 900 }, landscape)).toBe(false)
  })
})

describe('effectiveRatio', () => {
  it('prefers the per-image override', () => {
    expect(effectiveRatio({ ratio: square }, sixteenNine)).toEqual(square)
  })

  it('falls back to the batch ratio', () => {
    expect(effectiveRatio(undefined, sixteenNine)).toEqual(sixteenNine)
    expect(effectiveRatio({ rect: { x: 0, y: 0, width: 10, height: 10 } }, free)).toEqual(free)
  })
})

describe('effectiveCropRect', () => {
  it('returns undefined when nothing crops', () => {
    expect(effectiveCropRect(undefined, none, landscape)).toBeUndefined()
    expect(effectiveCropRect(undefined, free, landscape)).toBeUndefined()
  })

  it('uses a manual rect, clamped', () => {
    expect(
      effectiveCropRect({ rect: { x: -10, y: 0, width: 200, height: 100 } }, none, landscape),
    ).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('auto-centers from the batch ratio', () => {
    expect(effectiveCropRect(undefined, square, landscape)).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    })
  })

  it('per-image none beats a batch ratio', () => {
    expect(effectiveCropRect({ ratio: none }, square, landscape)).toBeUndefined()
  })

  it('treats a full-image manual rect as no crop', () => {
    expect(
      effectiveCropRect({ rect: { x: 0, y: 0, width: 1600, height: 900 } }, none, landscape),
    ).toBeUndefined()
  })

  it('treats a ratio matching the image as no crop', () => {
    expect(effectiveCropRect(undefined, sixteenNine, landscape)).toBeUndefined()
  })
})

describe('cropSnapshot', () => {
  it('is undefined for none/free without a manual rect', () => {
    expect(cropSnapshot(undefined, none)).toBeUndefined()
    expect(cropSnapshot(undefined, free)).toBeUndefined()
  })

  it('sends the manual rect when present', () => {
    const rect = { x: 1, y: 2, width: 30, height: 40 }
    expect(cropSnapshot({ rect }, sixteenNine)).toEqual({ rect })
  })

  it('sends the effective ratio for auto crops (worker computes the rect)', () => {
    expect(cropSnapshot(undefined, sixteenNine)).toEqual({ ratio: { w: 16, h: 9 } })
    expect(cropSnapshot({ ratio: square }, sixteenNine)).toEqual({ ratio: { w: 1, h: 1 } })
  })

  it('per-image none yields undefined even with a batch ratio', () => {
    expect(cropSnapshot({ ratio: none }, sixteenNine)).toBeUndefined()
  })
})

describe('resolveCropRect (worker side)', () => {
  it('returns undefined without a crop spec', () => {
    expect(resolveCropRect(landscape, undefined)).toBeUndefined()
  })

  it('clamps a provided rect and drops full-image rects', () => {
    expect(resolveCropRect(landscape, { rect: { x: 0, y: 0, width: 9999, height: 9999 } })).toBeUndefined()
    expect(resolveCropRect(landscape, { rect: { x: 100, y: 100, width: 200, height: 200 } })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    })
  })

  it('computes a centered crop from a ratio and drops no-op ratios', () => {
    expect(resolveCropRect(landscape, { ratio: { w: 1, h: 1 } })).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    })
    expect(resolveCropRect(landscape, { ratio: { w: 16, h: 9 } })).toBeUndefined()
  })
})

describe('percent conversions', () => {
  it('round-trips a rect through percent space', () => {
    const rect = { x: 400, y: 225, width: 800, height: 450 }
    const pct = rectToPercent(rect, landscape)
    expect(pct).toEqual({ x: 25, y: 25, width: 50, height: 50 })
    expect(percentToRect(pct, landscape)).toEqual(rect)
  })

  it('percentToRect clamps out-of-range values', () => {
    expect(percentToRect({ x: 99, y: 99, width: 50, height: 50 }, landscape)).toEqual({
      x: 800,
      y: 450,
      width: 800,
      height: 450,
    })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cropMath.test.ts`
Expected: FAIL — `Cannot find module './cropMath'` (or equivalent resolution error).

- [ ] **Step 4: Implement `src/lib/cropMath.ts`**

```ts
import type { CropRatio, CropRect, CropSettings } from '../types'
import type { Dimensions } from './resizeMath'

export const MIN_CROP_PX = 16

export interface PercentRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropSpec {
  rect?: CropRect
  ratio?: { w: number; h: number }
}

export function ratioValue(ratio: CropRatio | undefined): number | undefined {
  return ratio?.kind === 'ratio' ? ratio.w / ratio.h : undefined
}

export function ratioLabel(ratio: CropRatio): string {
  if (ratio.kind === 'none') return 'None'
  if (ratio.kind === 'free') return 'Free'
  return `${ratio.w}:${ratio.h}`
}

export function centeredCrop(dims: Dimensions, ratio: { w: number; h: number }): CropRect {
  const target = ratio.w / ratio.h
  let width = dims.width
  let height = width / target
  if (height > dims.height) {
    height = dims.height
    width = height * target
  }
  const w = Math.min(dims.width, Math.max(1, Math.round(width)))
  const h = Math.min(dims.height, Math.max(1, Math.round(height)))
  return {
    x: Math.round((dims.width - w) / 2),
    y: Math.round((dims.height - h) / 2),
    width: w,
    height: h,
  }
}

export function clampRect(rect: CropRect, dims: Dimensions): CropRect {
  const minW = Math.min(MIN_CROP_PX, dims.width)
  const minH = Math.min(MIN_CROP_PX, dims.height)
  const width = Math.max(minW, Math.min(Math.round(rect.width), dims.width))
  const height = Math.max(minH, Math.min(Math.round(rect.height), dims.height))
  const x = Math.max(0, Math.min(Math.round(rect.x), dims.width - width))
  const y = Math.max(0, Math.min(Math.round(rect.y), dims.height - height))
  return { x, y, width, height }
}

export function isFullImage(rect: CropRect, dims: Dimensions): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === dims.width && rect.height === dims.height
}

export function effectiveRatio(crop: CropSettings | undefined, globalCrop: CropRatio): CropRatio {
  return crop?.ratio ?? globalCrop
}

export function effectiveCropRect(
  crop: CropSettings | undefined,
  globalCrop: CropRatio,
  dims: Dimensions,
): CropRect | undefined {
  if (crop?.rect) {
    const clamped = clampRect(crop.rect, dims)
    return isFullImage(clamped, dims) ? undefined : clamped
  }
  const ratio = effectiveRatio(crop, globalCrop)
  if (ratio.kind !== 'ratio') return undefined
  const centered = centeredCrop(dims, ratio)
  return isFullImage(centered, dims) ? undefined : centered
}

export function cropSnapshot(
  crop: CropSettings | undefined,
  globalCrop: CropRatio,
): CropSpec | undefined {
  if (crop?.rect) return { rect: crop.rect }
  const ratio = effectiveRatio(crop, globalCrop)
  if (ratio.kind === 'ratio') return { ratio: { w: ratio.w, h: ratio.h } }
  return undefined
}

export function resolveCropRect(dims: Dimensions, crop: CropSpec | undefined): CropRect | undefined {
  if (!crop) return undefined
  if (crop.rect) {
    const clamped = clampRect(crop.rect, dims)
    return isFullImage(clamped, dims) ? undefined : clamped
  }
  if (crop.ratio) {
    const centered = centeredCrop(dims, crop.ratio)
    return isFullImage(centered, dims) ? undefined : centered
  }
  return undefined
}

export function rectToPercent(rect: CropRect, dims: Dimensions): PercentRect {
  return {
    x: (rect.x / dims.width) * 100,
    y: (rect.y / dims.height) * 100,
    width: (rect.width / dims.width) * 100,
    height: (rect.height / dims.height) * 100,
  }
}

export function percentToRect(pct: PercentRect, dims: Dimensions): CropRect {
  return clampRect(
    {
      x: (pct.x / 100) * dims.width,
      y: (pct.y / 100) * dims.height,
      width: (pct.width / 100) * dims.width,
      height: (pct.height / 100) * dims.height,
    },
    dims,
  )
}
```

Note: `EncodeSettings['crop']` in `types.ts` and `CropSpec` here are structurally identical; `types.ts` cannot import from `lib/` (it is the leaf module), so the shape is written out in both places.

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npx vitest run src/lib/cropMath.test.ts && npm run typecheck`
Expected: all cropMath tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/cropMath.ts src/lib/cropMath.test.ts
git commit -m "feat: add crop types and cropMath geometry module"
```

---

### Task 2: ImageData cropping in the worker pipeline

**Files:**
- Create: `src/codec/cropImage.ts`
- Test: `src/codec/cropImage.test.ts`
- Modify: `src/codec/codec.types.ts` (ProcessResult), `src/codec/codecApi.ts` (pipeline), `src/test/setup.ts` (ImageData guard)

**Interfaces:**
- Consumes: `resolveCropRect`, `CropRect` from Task 1.
- Produces:
  - `cropImageData(image: ImageData, rect: CropRect): ImageData` in `src/codec/cropImage.ts`.
  - `ProcessResult.crop?: CropRect` — the rect the worker actually applied (absent when no crop happened). Task 4 (optimizer) and Task 10 (compare) rely on this.
  - `processImage` order: decode → crop → resize → encode.

- [ ] **Step 1: Add an ImageData guard to the test setup**

jsdom provides `ImageData`, but guard it so codec tests never depend on jsdom internals. Replace the content of `src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest'

// Minimal ImageData for environments that lack it (used by codec crop tests).
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataShim {
    readonly data: Uint8ClampedArray
    readonly width: number
    readonly height: number
    readonly colorSpace = 'srgb'

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = height ?? dataOrWidth.length / 4 / widthOrHeight
      }
    }
  }
  ;(globalThis as Record<string, unknown>).ImageData = ImageDataShim
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/codec/cropImage.test.ts`. Pixels are encoded so every position has a unique RGBA value, making misaligned copies fail loudly:

```ts
import { describe, expect, it } from 'vitest'
import { cropImageData } from './cropImage'

// 4x3 image where pixel (x, y) has r = x, g = y, b = 42, a = 255
function makeImage(width = 4, height = 3): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x
      data[i + 1] = y
      data[i + 2] = 42
      data[i + 3] = 255
    }
  }
  return new ImageData(data, width, height)
}

function pixelAt(image: ImageData, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4
  return [...image.data.slice(i, i + 4)]
}

describe('cropImageData', () => {
  it('extracts the requested region with correct dimensions', () => {
    const out = cropImageData(makeImage(), { x: 1, y: 1, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
  })

  it('copies the right pixels (position-encoded)', () => {
    const out = cropImageData(makeImage(), { x: 1, y: 1, width: 2, height: 2 })
    expect(pixelAt(out, 0, 0)).toEqual([1, 1, 42, 255]) // source (1,1)
    expect(pixelAt(out, 1, 0)).toEqual([2, 1, 42, 255]) // source (2,1)
    expect(pixelAt(out, 0, 1)).toEqual([1, 2, 42, 255]) // source (1,2)
    expect(pixelAt(out, 1, 1)).toEqual([2, 2, 42, 255]) // source (2,2)
  })

  it('handles edge-touching crops', () => {
    const out = cropImageData(makeImage(), { x: 2, y: 0, width: 2, height: 3 })
    expect(pixelAt(out, 0, 0)).toEqual([2, 0, 42, 255])
    expect(pixelAt(out, 1, 2)).toEqual([3, 2, 42, 255])
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/codec/cropImage.test.ts`
Expected: FAIL — cannot find module `./cropImage`.

- [ ] **Step 4: Implement `src/codec/cropImage.ts`**

```ts
import type { CropRect } from '../types'

export function cropImageData(image: ImageData, rect: CropRect): ImageData {
  const { x, y, width, height } = rect
  const out = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const srcStart = ((y + row) * image.width + x) * 4
    out.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4)
  }
  return new ImageData(out, width, height)
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/codec/cropImage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire crop into the pipeline**

In `src/codec/codec.types.ts`, extend `ProcessResult`:

```ts
import type { CropRect, EncodeSettings } from '../types'

export interface ProcessInput {
  buffer: ArrayBuffer
  sourceType: string
  settings: EncodeSettings
}

export interface ProcessResult {
  buffer: ArrayBuffer
  outputType: string
  width: number
  height: number
  bytes: number
  crop?: CropRect
}

export interface CodecApi {
  processImage: (input: ProcessInput) => Promise<ProcessResult>
}
```

In `src/codec/codecApi.ts`, add imports and replace `processImage`:

```ts
import { resolveCropRect } from '../lib/cropMath'
import { cropImageData } from './cropImage'
```

```ts
async function processImage(input: ProcessInput): Promise<ProcessResult> {
  const { buffer, sourceType, settings } = input
  const decoded = await decodeToImageData(buffer, sourceType)
  const cropRect = resolveCropRect({ width: decoded.width, height: decoded.height }, settings.crop)
  const cropped = cropRect ? cropImageData(decoded, cropRect) : decoded
  const image = await resizeImage(cropped, settings)
  const output = await encodeImage(image, settings)
  return {
    buffer: output,
    outputType: outputMimeFor(settings.format),
    width: image.width,
    height: image.height,
    bytes: output.byteLength,
    crop: cropRect,
  }
}
```

- [ ] **Step 7: Full test run + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (no existing test asserts the absence of `crop` on results), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/codec/cropImage.ts src/codec/cropImage.test.ts src/codec/codec.types.ts src/codec/codecApi.ts src/test/setup.ts
git commit -m "feat: crop ImageData in the worker pipeline before resize"
```

---

### Task 3: Store — globalCrop, crop editor state, actions

**Files:**
- Modify: `src/store/useImagenStore.ts`
- Test: `src/store/useImagenStore.test.ts`

**Interfaces:**
- Consumes: `CropRatio`, `CropSettings` types from Task 1.
- Produces (all later UI tasks rely on these exact names):
  - State: `globalCrop: CropRatio` (initial `{ kind: 'none' }`), `cropEditorId: string | null` (initial `null`).
  - Actions: `setGlobalCrop(ratio: CropRatio): void` (clean-slate: clears every image's `crop`), `setImageCrop(id: string, crop: CropSettings | null): void`, `openCropEditor(id: string): void`, `closeCropEditor(): void`.
  - `clearAll()` resets `globalCrop` to `{ kind: 'none' }` and `cropEditorId` to `null`; `removeImage(id)` nulls `cropEditorId` if it pointed at the removed image.

- [ ] **Step 1: Write the failing tests**

In `src/store/useImagenStore.test.ts`, first update the shared `beforeEach` to also reset the new fields:

```ts
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
})
```

Then append this describe block at the end of the file:

```ts
describe('crop state', () => {
  const sixteenNine = { kind: 'ratio', w: 16, h: 9 } as const
  const rect = { x: 10, y: 10, width: 100, height: 100 }

  it('defaults to no batch crop and a closed editor', () => {
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'none' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })

  it('setGlobalCrop stores the ratio', () => {
    useImagenStore.getState().setGlobalCrop(sixteenNine)
    expect(useImagenStore.getState().globalCrop).toEqual(sixteenNine)
  })

  it('setImageCrop sets and clears one image only', () => {
    const { addFiles, setImageCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    setImageCrop(id1, { rect })
    expect(useImagenStore.getState().images[0].crop).toEqual({ rect })
    expect(useImagenStore.getState().images[1].crop).toBeUndefined()
    setImageCrop(id1, null)
    expect(useImagenStore.getState().images[0].crop).toBeUndefined()
    expect(id2).toBeTruthy()
  })

  it('setGlobalCrop clears all per-image crop state (clean slate)', () => {
    const { addFiles, setImageCrop, setGlobalCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    setImageCrop(id1, { rect })
    setImageCrop(id2, { ratio: { kind: 'free' } })
    setGlobalCrop(sixteenNine)
    expect(useImagenStore.getState().images.every((i) => i.crop === undefined)).toBe(true)
    expect(useImagenStore.getState().globalCrop).toEqual(sixteenNine)
  })

  it('open/close crop editor tracks the active image', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().openCropEditor(id)
    expect(useImagenStore.getState().cropEditorId).toBe(id)
    useImagenStore.getState().closeCropEditor()
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })

  it('removing the image being edited closes the editor', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().openCropEditor(id1)
    useImagenStore.getState().removeImage(id1)
    expect(useImagenStore.getState().cropEditorId).toBeNull()
    useImagenStore.getState().openCropEditor(id2)
    useImagenStore.getState().removeImage(id1) // no-op remove
    expect(useImagenStore.getState().cropEditorId).toBe(id2)
  })

  it('clearAll resets crop state', () => {
    const { addFiles, setGlobalCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    setGlobalCrop(sixteenNine)
    useImagenStore.getState().openCropEditor(useImagenStore.getState().images[0].id)
    useImagenStore.getState().clearAll()
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'none' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/store/useImagenStore.test.ts`
Expected: FAIL — `setGlobalCrop is not a function` (and TypeScript errors on the new state fields).

- [ ] **Step 3: Implement the store changes**

In `src/store/useImagenStore.ts`:

Update imports:

```ts
import type { CropRatio, CropSettings, EncodeSettings, ImageItem, ImageResult } from '../types'
```

Add to the `ImagenState` interface:

```ts
  globalCrop: CropRatio
  cropEditorId: string | null
```

and, alongside the other actions:

```ts
  setGlobalCrop: (ratio: CropRatio) => void
  setImageCrop: (id: string, crop: CropSettings | null) => void
  openCropEditor: (id: string) => void
  closeCropEditor: () => void
```

Add initial state next to `batch: { ...initialBatch }`:

```ts
  globalCrop: { kind: 'none' },
  cropEditorId: null,
```

Add the actions (after `setImageSettings`):

```ts
  setGlobalCrop: (ratio) =>
    set((state) => ({
      globalCrop: ratio,
      images: state.images.map((item) => (item.crop ? { ...item, crop: undefined } : item)),
    })),

  setImageCrop: (id, crop) =>
    set((state) => ({
      images: state.images.map((item) =>
        item.id === id ? { ...item, crop: crop ?? undefined } : item,
      ),
    })),

  openCropEditor: (id) => set({ cropEditorId: id }),

  closeCropEditor: () => set({ cropEditorId: null }),
```

Update `removeImage` to also clear the editor pointer — its return object becomes:

```ts
      return {
        images: state.images.filter((item) => item.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        cropEditorId: state.cropEditorId === id ? null : state.cropEditorId,
      }
```

Update `clearAll`'s return object:

```ts
      return {
        images: [],
        selectedId: null,
        batch: { ...initialBatch },
        globalCrop: { kind: 'none' } as CropRatio,
        cropEditorId: null,
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/store/useImagenStore.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/useImagenStore.ts src/store/useImagenStore.test.ts
git commit -m "feat: store crop ratio, per-image crops, and crop editor state"
```

---

### Task 4: Optimizer — inject crop into snapshots, record applied rect

**Files:**
- Modify: `src/codec/optimizer.ts`
- Test: `src/codec/optimizer.test.ts`

**Interfaces:**
- Consumes: `cropSnapshot` (Task 1), store fields (Task 3), `ProcessResult.crop` (Task 2).
- Produces: worker inputs carry `settings.crop` (`{ rect }` for manual crops, `{ ratio }` for auto crops, absent otherwise); `ImageResult.cropRect` is set from `ProcessResult.crop` on completion.

- [ ] **Step 1: Write the failing tests**

In `src/codec/optimizer.test.ts`, update `resetStore` to reset the new fields:

```ts
function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings('webp'),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
}
```

Extend `FakeWorkers.create`'s returned `processImage` so it echoes a crop rect when the input asks for one. Replace the `return { … }` inside `processImage` with:

```ts
        const crop = input.settings.crop?.rect ?? (input.settings.crop?.ratio ? { x: 0, y: 0, width: 10, height: 10 } : undefined)
        return {
          buffer: new ArrayBuffer(bytes),
          outputType: getFormatSpec(input.settings.format).mime,
          width: 12,
          height: 8,
          bytes,
          crop,
        }
```

Append a describe block at the end of the file:

```ts
describe('Optimizer crop snapshots', () => {
  it('sends no crop when globalCrop is none', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png'])
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toBeUndefined()
  })

  it('sends the batch ratio for auto crops', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png'])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toEqual({ ratio: { w: 16, h: 9 } })
  })

  it('sends the manual rect when the image has one', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])
    const rect = { x: 5, y: 6, width: 70, height: 80 }
    useImagenStore.getState().setImageCrop(id, { rect })
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toEqual({ rect })
  })

  it('stores the applied crop rect on the result', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])
    const rect = { x: 5, y: 6, width: 70, height: 80 }
    useImagenStore.getState().setImageCrop(id, { rect })
    optimizer.optimizeAll()
    await runToSettled()
    expect(useImagenStore.getState().images[0].result?.cropRect).toEqual(rect)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/codec/optimizer.test.ts`
Expected: the new describe block FAILS (`settings.crop` undefined where a value is expected; `cropRect` undefined). Pre-existing tests still pass.

- [ ] **Step 3: Implement the optimizer changes**

In `src/codec/optimizer.ts`:

Add imports:

```ts
import { cropSnapshot } from '../lib/cropMath'
import type { ImageItem } from '../types'
```

Add a private helper and use it wherever snapshots are taken:

```ts
  private resolveWithCrop(item: ImageItem, state: ImagenState): EncodeSettings {
    return {
      ...resolveSettings(item.settings, state.globalSettings),
      crop: cropSnapshot(item.crop, state.globalCrop),
    }
  }
```

In `optimizeAll`, replace the snapshot loop body:

```ts
    for (const item of state.images) {
      this.snapshots.set(item.id, this.resolveWithCrop(item, state))
    }
```

In `optimizeOne`, replace the snapshot line:

```ts
    this.snapshots.set(id, this.resolveWithCrop(item, state))
```

In `snapshotFor`, replace the fallback return:

```ts
    const item = state.images.find((entry) => entry.id === id)
    if (!item) return resolveSettings(null, state.globalSettings)
    return this.resolveWithCrop(item, state)
```

In `handleDone`, add `cropRect` to the `markDone` payload:

```ts
    state.markDone(id, {
      blob,
      url,
      outputType: result.outputType,
      outputBytes: result.bytes,
      width: result.width,
      height: result.height,
      outputName: uniqueOutputName(item.name, settings.format, takenNames),
      cropRect: result.crop,
    })
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/codec/optimizer.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/codec/optimizer.ts src/codec/optimizer.test.ts
git commit -m "feat: optimizer snapshots carry resolved crop; results record applied rect"
```

---

### Task 5: cropPreview — CSS styles for cropped previews

**Files:**
- Create: `src/lib/cropPreview.ts`
- Test: `src/lib/cropPreview.test.ts`

**Interfaces:**
- Consumes: `CropRect` (Task 1), `Dimensions` from resizeMath.
- Produces: `cropPreviewStyles(rect: CropRect, dims: Dimensions): { frame: CSSProperties; image: CSSProperties }`. `frame` carries `aspectRatio: '<w> / <h>'` and is meant for a `position: relative; overflow: hidden` element; `image` absolutely positions the full original inside so exactly the crop region fills the frame. Used by ImageCard (Task 9), CropEditorModal filmstrip (Task 8), CompareSlider (Task 10).

- [ ] **Step 1: Write the failing test**

Create `src/lib/cropPreview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cropPreviewStyles } from './cropPreview'

describe('cropPreviewStyles', () => {
  it('sizes the frame to the crop aspect ratio', () => {
    const { frame } = cropPreviewStyles({ x: 350, y: 0, width: 900, height: 900 }, { width: 1600, height: 900 })
    expect(frame.aspectRatio).toBe('900 / 900')
  })

  it('scales and offsets the image so the crop region fills the frame', () => {
    // crop the exact center quarter of a 400x200 image
    const { image } = cropPreviewStyles({ x: 100, y: 50, width: 200, height: 100 }, { width: 400, height: 200 })
    expect(image.width).toBe('200%')
    expect(image.height).toBe('200%')
    expect(image.left).toBe('-50%')
    expect(image.top).toBe('-50%')
    expect(image.position).toBe('absolute')
    expect(image.maxWidth).toBe('none')
    expect(image.maxHeight).toBe('none')
  })

  it('uses zero offsets for an origin crop', () => {
    const { image } = cropPreviewStyles({ x: 0, y: 0, width: 100, height: 100 }, { width: 200, height: 200 })
    expect(image.left).toBe('-0%')
    expect(image.top).toBe('-0%')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/cropPreview.test.ts`
Expected: FAIL — cannot find module `./cropPreview`.

- [ ] **Step 3: Implement `src/lib/cropPreview.ts`**

```ts
import type { CSSProperties } from 'react'
import type { CropRect } from '../types'
import type { Dimensions } from './resizeMath'

export interface CropPreviewStyles {
  frame: CSSProperties
  image: CSSProperties
}

// The frame element must be `position: relative; overflow: hidden`. The image
// element is the full original, absolutely positioned so that exactly the crop
// region fills the frame.
export function cropPreviewStyles(rect: CropRect, dims: Dimensions): CropPreviewStyles {
  return {
    frame: { aspectRatio: `${rect.width} / ${rect.height}` },
    image: {
      position: 'absolute',
      maxWidth: 'none',
      maxHeight: 'none',
      width: `${(dims.width / rect.width) * 100}%`,
      height: `${(dims.height / rect.height) * 100}%`,
      left: `-${(rect.x / rect.width) * 100}%`,
      top: `-${(rect.y / rect.height) * 100}%`,
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/cropPreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cropPreview.ts src/lib/cropPreview.test.ts
git commit -m "feat: pure CSS-style computation for cropped image previews"
```

---

### Task 6: RatioPicker component

**Files:**
- Create: `src/components/RatioPicker.tsx`
- Test: `src/components/RatioPicker.test.tsx`

**Interfaces:**
- Consumes: `CropRatio` (Task 1).
- Produces (used by CropControls in Task 7 and CropEditorModal in Task 8):

```ts
export interface RatioPickerProps {
  value: CropRatio | null // null = follow batch (only meaningful with batchLabel)
  onChange: (value: CropRatio | null) => void
  label: string // visible label text, e.g. 'Crop' or 'Aspect ratio'
  idPrefix: string // testids: `${idPrefix}-ratio-select`, `${idPrefix}-ratio-w`, `${idPrefix}-ratio-h`
  batchLabel?: string // when set, a 'Batch (…)' option is shown and maps to null
  disabled?: boolean
}
```

Select option values: `'batch'` (only when `batchLabel`), `'none'`, `'free'`, `'1:1'`, `'4:3'`, `'3:2'`, `'16:9'`, `'9:16'`, `'custom'`. Choosing `custom` reveals two integer inputs; `onChange` fires with `{ kind: 'ratio', w, h }` only once both are valid positive integers. Invalid/empty input fires nothing (last valid value stays).

- [ ] **Step 1: Write the failing tests**

Create `src/components/RatioPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RatioPicker from './RatioPicker'

describe('RatioPicker', () => {
  it('renders the label and reflects a preset value', () => {
    render(
      <RatioPicker value={{ kind: 'ratio', w: 16, h: 9 }} onChange={() => {}} label="Crop" idPrefix="crop" />,
    )
    expect(screen.getByText('Crop')).toBeInTheDocument()
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('16:9')
  })

  it('maps none/free/preset selections to CropRatio values', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'none' }} onChange={onChange} label="Crop" idPrefix="crop" />)
    const select = screen.getByTestId('crop-ratio-select')
    fireEvent.change(select, { target: { value: 'free' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'free' })
    fireEvent.change(select, { target: { value: '1:1' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 1, h: 1 })
    fireEvent.change(select, { target: { value: 'none' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'none' })
  })

  it('shows a batch option that maps to null when batchLabel is given', () => {
    const onChange = vi.fn()
    render(
      <RatioPicker
        value={{ kind: 'ratio', w: 1, h: 1 }}
        onChange={onChange}
        label="Aspect ratio"
        idPrefix="editor"
        batchLabel="Batch (16:9)"
      />,
    )
    expect(screen.getByText('Batch (16:9)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'batch' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('shows batch as the selected value when value is null', () => {
    render(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('batch')
  })

  it('custom selection reveals inputs and only fires when both are valid', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'none' }} onChange={onChange} label="Crop" idPrefix="crop" />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: 'custom' } })
    expect(onChange).not.toHaveBeenCalled()
    const w = screen.getByTestId('crop-ratio-w')
    const h = screen.getByTestId('crop-ratio-h')
    fireEvent.change(w, { target: { value: '21' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(h, { target: { value: '9' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 21, h: 9 })
    fireEvent.change(h, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps showing custom (not the matching preset) while the user edits custom values', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'ratio', w: 16, h: 9 }} onChange={onChange} label="Crop" idPrefix="crop" />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByTestId('crop-ratio-w'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('crop-ratio-h'), { target: { value: '1' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 1, h: 1 })
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('custom')
  })

  it('allows picking custom while following the batch value', () => {
    render(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'custom' } })
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('custom')
    expect(screen.getByTestId('editor-ratio-w')).toBeInTheDocument()
  })

  it('leaves custom mode when the value is externally reset to batch', () => {
    const { rerender } = render(
      <RatioPicker
        value={{ kind: 'ratio', w: 21, h: 9 }}
        onChange={() => {}}
        label="Aspect ratio"
        idPrefix="editor"
        batchLabel="Batch (16:9)"
      />,
    )
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'custom' } })
    rerender(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('batch')
  })

  it('disables the controls when disabled', () => {
    render(<RatioPicker value={{ kind: 'none' }} onChange={() => {}} label="Crop" idPrefix="crop" disabled />)
    expect(screen.getByTestId('crop-ratio-select')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/RatioPicker.test.tsx`
Expected: FAIL — cannot find module `./RatioPicker`.

- [ ] **Step 3: Implement `src/components/RatioPicker.tsx`**

```tsx
import { useState } from 'react'
import type { CropRatio } from '../types'

const RATIO_PRESETS = [
  { value: '1:1', w: 1, h: 1 },
  { value: '4:3', w: 4, h: 3 },
  { value: '3:2', w: 3, h: 2 },
  { value: '16:9', w: 16, h: 9 },
  { value: '9:16', w: 9, h: 16 },
] as const

export interface RatioPickerProps {
  value: CropRatio | null
  onChange: (value: CropRatio | null) => void
  label: string
  idPrefix: string
  batchLabel?: string
  disabled?: boolean
}

function parseRatioPart(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function selectionFor(value: CropRatio | null, isCustom: boolean): string {
  if (isCustom) return 'custom'
  if (value === null) return 'batch'
  if (value.kind === 'none') return 'none'
  if (value.kind === 'free') return 'free'
  const preset = RATIO_PRESETS.find((p) => p.w === value.w && p.h === value.h)
  return preset ? preset.value : 'custom'
}

export default function RatioPicker({
  value,
  onChange,
  label,
  idPrefix,
  batchLabel,
  disabled = false,
}: RatioPickerProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')

  // Leave custom mode when the value changes externally to a non-ratio value
  // (e.g. a Reset button or filmstrip navigation swapped the value under us).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (isCustom && (value === null || value.kind !== 'ratio')) setIsCustom(false)
  }

  const selection = selectionFor(value, isCustom)

  const emitCustom = (wRaw: string, hRaw: string) => {
    const w = parseRatioPart(wRaw)
    const h = parseRatioPart(hRaw)
    if (w != null && h != null) onChange({ kind: 'ratio', w, h })
  }

  const onSelect = (next: string) => {
    if (next === 'custom') {
      setIsCustom(true)
      if (value?.kind === 'ratio') {
        setCustomW(String(value.w))
        setCustomH(String(value.h))
      }
      return
    }
    setIsCustom(false)
    if (next === 'batch') return onChange(null)
    if (next === 'none') return onChange({ kind: 'none' })
    if (next === 'free') return onChange({ kind: 'free' })
    const preset = RATIO_PRESETS.find((p) => p.value === next)
    if (preset) onChange({ kind: 'ratio', w: preset.w, h: preset.h })
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <label className="flex flex-col gap-2.5">
        <span className="label">{label}</span>
        <select
          data-testid={`${idPrefix}-ratio-select`}
          value={selection}
          disabled={disabled}
          onChange={(event) => onSelect(event.target.value)}
          className="control-select min-w-36"
        >
          {batchLabel ? <option value="batch">{batchLabel}</option> : null}
          <option value="none">{batchLabel ? 'None' : 'No crop'}</option>
          <option value="free">Free</option>
          {RATIO_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.value}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>

      {selection === 'custom' ? (
        <div className="flex items-end gap-2">
          <label className="flex w-16 flex-col gap-2.5">
            <span className="label">W</span>
            <input
              data-testid={`${idPrefix}-ratio-w`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={customW !== '' ? customW : !isCustom && value?.kind === 'ratio' ? String(value.w) : customW}
              disabled={disabled}
              onChange={(event) => {
                setCustomW(event.target.value)
                emitCustom(event.target.value, customH)
              }}
              className="control font-mono"
            />
          </label>
          <span className="pb-2 text-xs text-ink-faint">:</span>
          <label className="flex w-16 flex-col gap-2.5">
            <span className="label">H</span>
            <input
              data-testid={`${idPrefix}-ratio-h`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={customH !== '' ? customH : !isCustom && value?.kind === 'ratio' ? String(value.h) : customH}
              disabled={disabled}
              onChange={(event) => {
                setCustomH(event.target.value)
                emitCustom(customW, event.target.value)
              }}
              className="control font-mono"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/RatioPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RatioPicker.tsx src/components/RatioPicker.test.tsx
git commit -m "feat: shared aspect-ratio picker with presets and custom W:H"
```

---

### Task 7: CropControls in the global settings bar

**Files:**
- Create: `src/components/CropControls.tsx`
- Test: `src/components/CropControls.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `RatioPicker` (Task 6), store fields/actions (Task 3), `ratioLabel` (Task 1).
- Produces: `<CropControls />` default export, mounted in App's settings bezel between `SettingsPanel`/`ResizeControls` and `BatchToolbar` (crop runs before resize in the pipeline, so it sits above `ResizeControls`). Testids: `crop-controls`, `crop-ratio-select` (via picker), `crop-adjust-button`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/CropControls.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CropControls from './CropControls'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
})

describe('CropControls', () => {
  it('defaults to no crop and hides the adjust button', () => {
    render(<CropControls />)
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('none')
    expect(screen.queryByTestId('crop-adjust-button')).not.toBeInTheDocument()
  })

  it('choosing a preset sets the batch ratio in the store', () => {
    render(<CropControls />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: '16:9' } })
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'ratio', w: 16, h: 9 })
  })

  it('shows the adjust button when cropping is active and images exist, and opens the editor at the first image', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    render(<CropControls />)
    const button = screen.getByTestId('crop-adjust-button')
    fireEvent.click(button)
    expect(useImagenStore.getState().cropEditorId).toBe(useImagenStore.getState().images[0].id)
  })

  it('hides the adjust button when there are no images', () => {
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    render(<CropControls />)
    expect(screen.queryByTestId('crop-adjust-button')).not.toBeInTheDocument()
  })

  it('disables controls while processing', () => {
    useImagenStore.getState().addFiles([makeFile('a.jpg')])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<CropControls />)
    expect(screen.getByTestId('crop-ratio-select')).toBeDisabled()
    expect(screen.getByTestId('crop-adjust-button')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CropControls.test.tsx`
Expected: FAIL — cannot find module `./CropControls`.

- [ ] **Step 3: Implement `src/components/CropControls.tsx`**

```tsx
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
```

- [ ] **Step 4: Mount it in `src/App.tsx`**

Add the import:

```tsx
import CropControls from "./components/CropControls";
```

In the settings bezel, insert between `SettingsPanel` and `ResizeControls` (crop precedes resize in the pipeline):

```tsx
              <div className="bezel-core divide-y divide-white/[0.06] overflow-hidden bg-canvas/50 ring-1 ring-white/[0.04]">
                <SettingsPanel />
                <CropControls />
                <ResizeControls />
                <BatchToolbar />
              </div>
```

- [ ] **Step 5: Run to verify pass (including App tests)**

Run: `npx vitest run src/components/CropControls.test.tsx src/App.test.tsx && npm run typecheck`
Expected: PASS. If `App.test.tsx` fails on the new section, fix the assertion there (it should only be additive).

- [ ] **Step 6: Commit**

```bash
git add src/components/CropControls.tsx src/components/CropControls.test.tsx src/App.tsx
git commit -m "feat: global crop controls with batch ratio and adjust entry point"
```

---

### Task 8: CropEditorModal with react-image-crop

**Files:**
- Create: `src/components/CropEditorModal.tsx`
- Test: `src/components/CropEditorModal.test.tsx`
- Modify: `package.json` (new dependency), `src/App.tsx` (mount), `src/index.css` (ReactCrop restyle)

**Interfaces:**
- Consumes: store (Task 3), `cropMath` (Task 1), `cropPreviewStyles` (Task 5), `RatioPicker` (Task 6), `react-image-crop` (`ReactCrop` default export, `PercentCrop` type, CSS at `react-image-crop/dist/ReactCrop.css`).
- Produces: `<CropEditorModal />` default export mounted once in App; renders `null` while `cropEditorId` is null. Testids: `crop-editor`, `crop-editor-close`, `crop-editor-counter`, `crop-editor-prev`, `crop-editor-next`, `crop-editor-reset`, `crop-filmstrip`, `crop-filmstrip-thumb` (one per image, `data-active="true"` on the current one), `editor-ratio-select` (via RatioPicker), `crop-editor-uncropped` (shown when the effective ratio is `none`).
- Behavior contract: ReactCrop is controlled with **percent** crops; on `onComplete` the percent crop is converted with `percentToRect` against the natural dimensions and stored via `setImageCrop(id, { ...(item.crop ?? {}), rect })` (live-apply). The RatioPicker (with `batchLabel`) writes `setImageCrop(id, null)` for batch, or `setImageCrop(id, { ratio })` (dropping any rect → re-seeds auto-centered). Reset calls `setImageCrop(id, null)`.

- [ ] **Step 1: Install the dependency (exact pin, per project convention)**

Run: `npm install --save-exact react-image-crop`
Expected: `react-image-crop` appears in `package.json` dependencies pinned to an exact 11.x version.

- [ ] **Step 2: Write the failing tests**

Create `src/components/CropEditorModal.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CropEditorModal from './CropEditorModal'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

vi.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({
    children,
    aspect,
    crop,
    onComplete,
  }: {
    children: React.ReactNode
    aspect?: number
    crop?: { x: number; y: number; width: number; height: number }
    onComplete?: (px: unknown, pct: unknown) => void
  }) => (
    <div
      data-testid="react-crop"
      data-aspect={aspect != null ? aspect.toFixed(4) : 'free'}
      data-crop={crop ? [crop.x, crop.y, crop.width, crop.height].map(Math.round).join(',') : 'unset'}
    >
      <button
        type="button"
        data-testid="simulate-crop-complete"
        onClick={() =>
          onComplete?.(
            { unit: 'px', x: 0, y: 0, width: 0, height: 0 },
            { unit: '%', x: 10, y: 20, width: 50, height: 25 },
          )
        }
      >
        simulate
      </button>
      {children}
    </div>
  ),
}))

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function seedTwoImages(): string[] {
  const store = useImagenStore.getState()
  store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
  const ids = useImagenStore.getState().images.map((item) => item.id)
  store.setImageDimensions(ids[0], 1600, 900)
  store.setImageDimensions(ids[1], 800, 1200)
  return ids
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
    globalCrop: { kind: 'none' },
    cropEditorId: null,
  })
})

describe('CropEditorModal', () => {
  it('renders nothing while closed', () => {
    seedTwoImages()
    render(<CropEditorModal />)
    expect(screen.queryByTestId('crop-editor')).not.toBeInTheDocument()
  })

  it('shows the active image with a counter and filmstrip', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor')).toBeInTheDocument()
    expect(screen.getByTestId('crop-editor-counter')).toHaveTextContent('1 of 2')
    expect(screen.getAllByTestId('crop-filmstrip-thumb')).toHaveLength(2)
    expect(screen.getAllByTestId('crop-filmstrip-thumb')[0]).toHaveAttribute('data-active', 'true')
  })

  it('locks the overlay to the batch ratio and seeds the centered crop', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    const rc = screen.getByTestId('react-crop')
    expect(rc).toHaveAttribute('data-aspect', (1).toFixed(4))
    // centered 1:1 on 1600x900 → x 350/1600 = 21.875%, width 900/1600 = 56.25%
    expect(rc).toHaveAttribute('data-crop', '22,0,56,100')
  })

  it('stores the completed crop as a natural-pixel rect (live-apply)', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'free' })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('simulate-crop-complete'))
    // 10%,20%,50%,25% of 1600x900
    expect(useImagenStore.getState().images[0].crop?.rect).toEqual({
      x: 160,
      y: 180,
      width: 800,
      height: 225,
    })
  })

  it('navigates with prev/next and by clicking filmstrip thumbs', () => {
    const [id1, id2] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-prev')).toBeDisabled()
    fireEvent.click(screen.getByTestId('crop-editor-next'))
    expect(useImagenStore.getState().cropEditorId).toBe(id2)
    fireEvent.click(screen.getAllByTestId('crop-filmstrip-thumb')[0])
    expect(useImagenStore.getState().cropEditorId).toBe(id1)
  })

  it('per-image ratio override drops the rect and re-seeds', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: '1:1' } })
    expect(useImagenStore.getState().images[0].crop).toEqual({ ratio: { kind: 'ratio', w: 1, h: 1 } })
  })

  it('reset returns the image to the batch default', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('crop-editor-reset'))
    expect(useImagenStore.getState().images[0].crop).toBeUndefined()
  })

  it('shows an uncropped notice instead of the overlay when the effective ratio is none', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { ratio: { kind: 'none' } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-uncropped')).toBeInTheDocument()
    expect(screen.queryByTestId('react-crop')).not.toBeInTheDocument()
  })

  it('closes on the close button and on Escape', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('crop-editor-close'))
    expect(useImagenStore.getState().cropEditorId).toBeNull()
    useImagenStore.getState().openCropEditor(id1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/components/CropEditorModal.test.tsx`
Expected: FAIL — cannot find module `./CropEditorModal`.

- [ ] **Step 4: Implement `src/components/CropEditorModal.tsx`**

```tsx
import { useEffect, useState } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useImagenStore } from '../store/useImagenStore'
import {
  effectiveCropRect,
  effectiveRatio,
  percentToRect,
  ratioLabel,
  ratioValue,
  rectToPercent,
} from '../lib/cropMath'
import { cropPreviewStyles } from '../lib/cropPreview'
import RatioPicker from './RatioPicker'
import type { ImageItem } from '../types'

function CrossGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m4 4 8 8m0-8-8 8" />
    </svg>
  )
}

function ArrowGlyph({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'left' ? <path d="M10 3.5 5.5 8l4.5 4.5" /> : <path d="M6 3.5 10.5 8 6 12.5" />}
    </svg>
  )
}

function FilmstripThumb({
  item,
  active,
  onSelect,
}: {
  item: ImageItem
  active: boolean
  onSelect: () => void
}) {
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const hasDims = item.originalWidth != null && item.originalHeight != null
  const dims = hasDims ? { width: item.originalWidth!, height: item.originalHeight! } : null
  const rect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined
  const styles = rect && dims ? cropPreviewStyles(rect, dims) : null

  return (
    <button
      type="button"
      data-testid="crop-filmstrip-thumb"
      data-active={active ? 'true' : 'false'}
      aria-label={`Edit crop for ${item.name}`}
      aria-current={active}
      onClick={onSelect}
      className={`relative h-14 shrink-0 cursor-pointer overflow-hidden rounded-lg transition-all duration-200 ${
        active ? 'ring-2 ring-ember' : 'opacity-60 ring-1 ring-white/[0.12] hover:opacity-100'
      }`}
    >
      {styles ? (
        <div className="relative h-full overflow-hidden" style={styles.frame}>
          <img src={item.previewUrl} alt="" style={styles.image} draggable={false} />
        </div>
      ) : (
        <img src={item.previewUrl} alt="" className="h-full w-auto object-cover" draggable={false} />
      )}
    </button>
  )
}

export default function CropEditorModal() {
  const cropEditorId = useImagenStore((state) => state.cropEditorId)
  const images = useImagenStore((state) => state.images)
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const openCropEditor = useImagenStore((state) => state.openCropEditor)
  const closeCropEditor = useImagenStore((state) => state.closeCropEditor)
  const setImageCrop = useImagenStore((state) => state.setImageCrop)
  const setImageDimensions = useImagenStore((state) => state.setImageDimensions)
  const processing = useImagenStore((state) => state.batch.status === 'processing')

  const [draft, setDraft] = useState<PercentCrop | null>(null)
  const [draftFor, setDraftFor] = useState<string | null>(null)

  const open = cropEditorId != null

  // Escape closes; the page behind must not scroll while the dialog is open
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCropEditor()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, closeCropEditor])

  const index = images.findIndex((entry) => entry.id === cropEditorId)
  const item = index >= 0 ? images[index] : null
  if (!open || !item) return null

  const hasDims = item.originalWidth != null && item.originalHeight != null
  const dims = hasDims ? { width: item.originalWidth!, height: item.originalHeight! } : null
  const ratio = effectiveRatio(item.crop, globalCrop)
  const storedRect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined

  const displayCrop: PercentCrop | undefined =
    draft && draftFor === item.id
      ? draft
      : dims && storedRect
        ? { unit: '%', ...rectToPercent(storedRect, dims) }
        : undefined

  const onComplete = (pct: PercentCrop) => {
    if (!dims || pct.width < 0.5 || pct.height < 0.5) return
    const rect = percentToRect(pct, dims)
    setImageCrop(item.id, { ...(item.crop ?? {}), rect })
    setDraft(null)
    setDraftFor(null)
  }

  const navigate = (target: ImageItem | undefined) => {
    if (!target) return
    setDraft(null)
    setDraftFor(null)
    openCropEditor(target.id)
  }

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (item.originalWidth != null) return
    const img = event.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageDimensions(item.id, img.naturalWidth, img.naturalHeight)
    }
  }

  const onFilmstripKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') navigate(images[index - 1])
    if (event.key === 'ArrowRight') navigate(images[index + 1])
  }

  const previewImg = (
    <img
      src={item.previewUrl}
      alt={item.name}
      onLoad={onImageLoad}
      draggable={false}
      className="max-h-[55dvh] w-auto max-w-full"
    />
  )

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-xl sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeCropEditor()
      }}
    >
      <section
        data-testid="crop-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Crop ${item.name}`}
        className="bezel w-full max-w-4xl animate-pop"
      >
        <div className="bezel-core flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto bg-canvas p-4 ring-1 ring-white/[0.04] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="label">Adjust crop</h2>
              <p className="mt-1 truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
            </div>
            <button
              type="button"
              data-testid="crop-editor-close"
              aria-label="Close crop editor"
              autoFocus
              onClick={closeCropEditor}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.07] hover:text-ink active:scale-95"
            >
              <CrossGlyph />
            </button>
          </div>

          <div className="checker flex items-center justify-center overflow-hidden rounded-xl p-2">
            {ratio.kind === 'none' ? (
              <div
                data-testid="crop-editor-uncropped"
                className="flex flex-col items-center gap-2 px-6 py-16 text-center"
              >
                {previewImg}
                <span className="text-xs text-ink-faint">
                  This image is not cropped. Pick an aspect ratio below to crop it.
                </span>
              </div>
            ) : (
              <ReactCrop
                crop={displayCrop}
                aspect={ratioValue(ratio)}
                onChange={(_, pct) => {
                  setDraft(pct)
                  setDraftFor(item.id)
                }}
                onComplete={(_, pct) => onComplete(pct)}
                ruleOfThirds
                keepSelection
                minWidth={8}
                minHeight={8}
              >
                {previewImg}
              </ReactCrop>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <RatioPicker
              label="Aspect ratio"
              idPrefix="editor"
              value={item.crop?.ratio ?? null}
              batchLabel={`Batch (${ratioLabel(globalCrop)})`}
              disabled={processing}
              onChange={(value) =>
                value === null ? setImageCrop(item.id, null) : setImageCrop(item.id, { ratio: value })
              }
            />
            <button
              type="button"
              data-testid="crop-editor-reset"
              disabled={processing}
              onClick={() => {
                setDraft(null)
                setDraftFor(null)
                setImageCrop(item.id, null)
              }}
              className="btn-ghost h-9 px-4 text-xs"
            >
              Reset to centered
            </button>
          </div>

          <div className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              data-testid="crop-editor-prev"
              aria-label="Previous image"
              disabled={index <= 0}
              onClick={() => navigate(images[index - 1])}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowGlyph direction="left" />
            </button>

            <div
              data-testid="crop-filmstrip"
              role="listbox"
              aria-label="Batch images"
              tabIndex={0}
              onKeyDown={onFilmstripKeyDown}
              className="flex flex-1 items-center gap-2 overflow-x-auto py-1"
            >
              {images.map((entry) => (
                <FilmstripThumb
                  key={entry.id}
                  item={entry}
                  active={entry.id === item.id}
                  onSelect={() => navigate(entry)}
                />
              ))}
            </div>

            <span data-testid="crop-editor-counter" className="shrink-0 font-mono text-[11px] text-ink-faint">
              {index + 1} of {images.length}
            </span>

            <button
              type="button"
              data-testid="crop-editor-next"
              aria-label="Next image"
              disabled={index >= images.length - 1}
              onClick={() => navigate(images[index + 1])}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-ink-dim transition-all duration-200 hover:border-white/[0.2] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowGlyph direction="right" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Mount it in `src/App.tsx`**

Add the import and render it next to `CompareSlider` (it self-hides while closed):

```tsx
import CropEditorModal from "./components/CropEditorModal";
```

```tsx
            <CompareSlider />
            <CropEditorModal />
            <ImageGrid />
```

- [ ] **Step 6: Restyle ReactCrop with design tokens**

Append to `src/index.css` (after the existing `@layer components` content or as a new block at the end of the file):

```css
/* react-image-crop, restyled to match the design system */
.ReactCrop__crop-selection {
  border: 1.5px solid color-mix(in oklab, var(--color-ember) 90%, white);
  border-image: none;
  border-radius: 2px;
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
}

.ReactCrop__rule-of-thirds-vt::before,
.ReactCrop__rule-of-thirds-vt::after,
.ReactCrop__rule-of-thirds-hz::before,
.ReactCrop__rule-of-thirds-hz::after {
  background-color: rgb(255 255 255 / 0.22);
}

.ReactCrop__drag-handle,
.ReactCrop__drag-handle::after {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background-color: var(--color-ember);
  border: 2px solid var(--color-well);
  outline: none;
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/components/CropEditorModal.test.tsx && npm test && npm run typecheck`
Expected: modal tests PASS; the full suite stays green; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/CropEditorModal.tsx src/components/CropEditorModal.test.tsx src/App.tsx src/index.css
git commit -m "feat: crop editor modal with react-image-crop overlay and filmstrip"
```

---

### Task 9: ImageCard — cropped thumbnail, ratio badge, crop button

**Files:**
- Modify: `src/components/ImageCard.tsx`
- Test: `src/components/ImageCard.test.tsx`

**Interfaces:**
- Consumes: `effectiveCropRect`, `effectiveRatio`, `ratioLabel` (Task 1), `cropPreviewStyles` (Task 5), `openCropEditor` (Task 3).
- Produces: testids `crop-badge` (text = ratio label like `16:9`, or `Crop` for freeform rects), `crop-open-button`, `thumbnail-crop-frame`. Existing `thumbnail` testid stays on the `<img>` in both branches.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ImageCard.test.tsx` (match the file's existing helpers for creating items/store state — reuse its `makeItem`/render helpers if present; otherwise use the store as below). Add this describe block:

```tsx
describe('cropping UI', () => {
  function seedCroppedImage() {
    useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageDimensions(id, 1600, 900)
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    return useImagenStore.getState().images[0]
  }

  it('shows no crop badge or frame without a crop', () => {
    useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
    const item = useImagenStore.getState().images[0]
    render(<ImageCard item={item} />)
    expect(screen.queryByTestId('crop-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('thumbnail-crop-frame')).not.toBeInTheDocument()
  })

  it('previews the crop and shows the ratio badge when cropping is active', () => {
    const item = seedCroppedImage()
    render(<ImageCard item={item} />)
    expect(screen.getByTestId('crop-badge')).toHaveTextContent('1:1')
    const frame = screen.getByTestId('thumbnail-crop-frame')
    expect(frame.style.aspectRatio).toBe('900 / 900')
    expect(screen.getByTestId('thumbnail')).toBeInTheDocument()
  })

  it('opens the crop editor at this image', () => {
    const item = seedCroppedImage()
    render(<ImageCard item={item} />)
    fireEvent.click(screen.getByTestId('crop-open-button'))
    expect(useImagenStore.getState().cropEditorId).toBe(item.id)
  })

  it('labels a freeform manual crop as "Crop"', () => {
    useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageDimensions(id, 1600, 900)
    useImagenStore.getState().setGlobalCrop({ kind: 'free' })
    useImagenStore.getState().setImageCrop(id, { rect: { x: 0, y: 0, width: 400, height: 300 } })
    render(<ImageCard item={useImagenStore.getState().images[0]} />)
    expect(screen.getByTestId('crop-badge')).toHaveTextContent('Crop')
  })
})
```

Note for the implementer: this file already has a `beforeEach` that resets the store — extend its `useImagenStore.setState({...})` call with `globalCrop: { kind: 'none' }, cropEditorId: null` the same way as in Task 3, and make sure `fireEvent`, `screen`, `render`, and `useImagenStore` are imported (they already are for the existing tests).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ImageCard.test.tsx`
Expected: the new describe block FAILS (missing testids); existing tests pass.

- [ ] **Step 3: Implement the ImageCard changes**

In `src/components/ImageCard.tsx`:

Add imports:

```tsx
import { effectiveCropRect, effectiveRatio, ratioLabel } from '../lib/cropMath'
import { cropPreviewStyles } from '../lib/cropPreview'
```

Add a crop glyph next to the other glyphs:

```tsx
function CropGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 1.5v10h10" />
      <path d="M1.5 4.5h10v10" />
    </svg>
  )
}
```

Inside the component, read the crop state (after the existing store hooks):

```tsx
  const globalCrop = useImagenStore((state) => state.globalCrop)
  const openCropEditor = useImagenStore((state) => state.openCropEditor)

  const dims = hasDimensions
    ? { width: item.originalWidth!, height: item.originalHeight! }
    : null
  const cropRect = dims ? effectiveCropRect(item.crop, globalCrop, dims) : undefined
  const cropStyles = cropRect && dims ? cropPreviewStyles(cropRect, dims) : null
  const cropRatio = effectiveRatio(item.crop, globalCrop)
  const cropBadge = cropRect ? (cropRatio.kind === 'ratio' ? ratioLabel(cropRatio) : 'Crop') : null
```

(Place this block after the existing `hasDimensions` declaration, which it depends on.)

Replace the thumbnail `<img …>` element with a conditional:

```tsx
          {cropStyles ? (
            <div
              data-testid="thumbnail-crop-frame"
              className="relative max-h-full w-full overflow-hidden rounded-[0.375rem]"
              style={cropStyles.frame}
            >
              <img
                data-testid="thumbnail"
                src={item.previewUrl}
                alt={item.name}
                onLoad={onLoad}
                loading="lazy"
                decoding="async"
                style={cropStyles.image}
              />
            </div>
          ) : (
            <img
              data-testid="thumbnail"
              src={item.previewUrl}
              alt={item.name}
              onLoad={onLoad}
              loading="lazy"
              decoding="async"
              className="max-h-full max-w-full object-contain"
            />
          )}
```

Add the crop button in the thumbnail container, mirroring the remove button but top-left:

```tsx
          <button
            type="button"
            data-testid="crop-open-button"
            aria-label={`Crop ${item.name}`}
            disabled={processing}
            onClick={() => openCropEditor(item.id)}
            className="absolute top-2 left-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 hover:bg-black/75 hover:text-white focus-visible:opacity-100 active:scale-95 disabled:cursor-not-allowed"
          >
            <CropGlyph />
          </button>
```

Add the badge next to the `override-indicator` span (same flex container):

```tsx
            {cropBadge ? (
              <span
                data-testid="crop-badge"
                title="This image will be cropped"
                className="rounded-full border border-white/[0.14] bg-white/[0.05] px-1.5 py-px text-[9px] tracking-[0.08em] text-ink-dim uppercase"
              >
                {cropBadge}
              </span>
            ) : null}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ImageCard.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImageCard.tsx src/components/ImageCard.test.tsx
git commit -m "feat: image cards preview crops with a ratio badge and crop entry point"
```

---

### Task 10: CompareSlider — crop-aligned before side

**Files:**
- Modify: `src/components/CompareSlider.tsx`
- Test: `src/components/CompareSlider.test.tsx`

**Interfaces:**
- Consumes: `ImageResult.cropRect` (Tasks 1/4), `cropPreviewStyles` (Task 5).
- Produces: when `item.result.cropRect` exists and the item has dimensions, both sides render inside identical centered frames with `aspectRatio: '<result.width> / <result.height>'` (testids `compare-frame-original`, `compare-frame-optimized`); the original image uses the crop-preview transform so the two sides stay pixel-aligned. Without a `cropRect`, the markup is unchanged from today.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/CompareSlider.test.tsx` a describe block. Reuse the file's existing helpers for seeding a done image (it necessarily has some — follow the same pattern used by the existing tests to build an `ImageItem` with a `result` and set store state). The new tests:

```tsx
describe('crop alignment', () => {
  it('renders identical aspect frames on both sides when the result was cropped', () => {
    seedDoneImage({
      originalWidth: 1600,
      originalHeight: 900,
      result: { width: 900, height: 900, cropRect: { x: 350, y: 0, width: 900, height: 900 } },
    })
    render(<CompareSlider />)
    const frameA = screen.getByTestId('compare-frame-original')
    const frameB = screen.getByTestId('compare-frame-optimized')
    expect(frameA.style.aspectRatio).toBe('900 / 900')
    expect(frameB.style.aspectRatio).toBe('900 / 900')
    const original = screen.getByTestId('compare-original')
    // 1600/900 ≈ 177.78% width, offset -350/900 ≈ -38.89%
    expect(original.style.width).toBe(`${(1600 / 900) * 100}%`)
    expect(original.style.left).toBe(`-${(350 / 900) * 100}%`)
  })

  it('keeps the plain markup when the result has no crop', () => {
    seedDoneImage({ originalWidth: 1600, originalHeight: 900, result: { width: 800, height: 450 } })
    render(<CompareSlider />)
    expect(screen.queryByTestId('compare-frame-original')).not.toBeInTheDocument()
    expect(screen.getByTestId('compare-original')).toBeInTheDocument()
  })
})
```

Where `seedDoneImage` is a small local helper added to the test file if an equivalent doesn't exist:

```tsx
function seedDoneImage({
  originalWidth,
  originalHeight,
  result,
}: {
  originalWidth: number
  originalHeight: number
  result: { width: number; height: number; cropRect?: { x: number; y: number; width: number; height: number } }
}): void {
  useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
  const id = useImagenStore.getState().images[0].id
  useImagenStore.getState().setImageDimensions(id, originalWidth, originalHeight)
  useImagenStore.getState().markProcessing(id)
  useImagenStore.getState().markDone(id, {
    blob: new Blob(['y'], { type: 'image/webp' }),
    url: 'blob:out-1',
    outputType: 'image/webp',
    outputBytes: 500,
    width: result.width,
    height: result.height,
    outputName: 'a.webp',
    cropRect: result.cropRect,
  })
  useImagenStore.getState().select(id)
}
```

Note: `markProcessing` requires the batch to allow it — check the existing tests in this file first and mirror how they get an item to `done` (they may set state directly with `useImagenStore.setState`). If they set images directly, do the same here, including `result.cropRect`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CompareSlider.test.tsx`
Expected: new tests FAIL (missing `compare-frame-*` testids); existing tests pass.

- [ ] **Step 3: Implement the CompareSlider changes**

In `src/components/CompareSlider.tsx`:

Add imports:

```tsx
import { cropPreviewStyles } from '../lib/cropPreview'
```

After `const savings = …`, compute the alignment styles:

```tsx
  const hasDims = item.originalWidth != null && item.originalHeight != null
  const cropRect = result.cropRect
  const alignCrop = cropRect != null && hasDims
  const frameStyle = alignCrop ? { aspectRatio: `${result.width} / ${result.height}` } : undefined
  const originalStyles = alignCrop
    ? cropPreviewStyles(cropRect, { width: item.originalWidth!, height: item.originalHeight! })
    : null
```

Replace the optimized side's inner container content (the `previewable ? <img …> : <div …>` branch) so the `<img>` is wrapped when aligning:

```tsx
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            {previewable ? (
              alignCrop ? (
                <div
                  data-testid="compare-frame-optimized"
                  className="relative max-h-full w-full overflow-hidden"
                  style={frameStyle}
                >
                  <img
                    data-testid="compare-optimized"
                    src={result.url}
                    alt={`Optimized ${item.name}`}
                    draggable={false}
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              ) : (
                <img
                  data-testid="compare-optimized"
                  src={result.url}
                  alt={`Optimized ${item.name}`}
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                />
              )
            ) : (
              /* existing JXL preview-unavailable block, unchanged */
            )}
          </div>
```

Replace the original side's `<img>` the same way:

```tsx
            {alignCrop && originalStyles ? (
              <div
                data-testid="compare-frame-original"
                className="relative max-h-full w-full overflow-hidden"
                style={frameStyle}
              >
                <img
                  data-testid="compare-original"
                  src={item.previewUrl}
                  alt={`Original ${item.name}`}
                  draggable={false}
                  style={originalStyles.image}
                />
              </div>
            ) : (
              <img
                data-testid="compare-original"
                src={item.previewUrl}
                alt={`Original ${item.name}`}
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            )}
```

(The comment placeholder above refers to keeping the existing JXL block exactly as it is — do not retype it, leave it untouched.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/CompareSlider.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/CompareSlider.tsx src/components/CompareSlider.test.tsx
git commit -m "feat: compare slider aligns the original to the applied crop"
```

---

### Task 11: Resize hints use cropped dimensions

**Files:**
- Modify: `src/components/ResizeControls.tsx`, `src/components/PerImageSettings.tsx`
- Test: `src/components/ResizeControls.test.tsx`

**Interfaces:**
- Consumes: `effectiveCropRect` (Task 1).
- Produces: the `example` passed to `ResizeHint` reflects the cropped dimensions when a crop is active, so "1600 × 900 → 800 × 450" becomes "900 × 900 → 450 × 450" under a 1:1 crop. `ResizeHint` itself is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/components/ResizeControls.test.tsx` (extend its store-reset `beforeEach` with `globalCrop: { kind: 'none' }, cropEditorId: null` first, as in Task 3):

```tsx
describe('crop-aware example', () => {
  it('previews resize math against the cropped dimensions', () => {
    useImagenStore.getState().addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageDimensions(id, 1600, 900)
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().setGlobalSettings({ resize: { mode: 'percentage', percentage: 50 } })
    render(<ResizeControls />)
    expect(screen.getByTestId('resize-preview')).toHaveTextContent('900 × 900 → 450 × 450 px')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ResizeControls.test.tsx`
Expected: the new test FAILS showing `1600 × 900 → 800 × 450 px`.

- [ ] **Step 3: Implement**

In `src/components/ResizeControls.tsx`, add the import:

```tsx
import { effectiveCropRect } from '../lib/cropMath'
```

read `globalCrop` in the component:

```tsx
  const globalCrop = useImagenStore((state) => state.globalCrop)
```

and replace the `example={…}` expression passed to `ResizeHint` with:

```tsx
            example={
              exampleItem
                ? (() => {
                    const dims = {
                      width: exampleItem.originalWidth!,
                      height: exampleItem.originalHeight!,
                    }
                    const rect = effectiveCropRect(exampleItem.crop, globalCrop, dims)
                    return {
                      width: rect?.width ?? dims.width,
                      height: rect?.height ?? dims.height,
                      name: exampleItem.name,
                    }
                  })()
                : undefined
            }
```

In `src/components/PerImageSettings.tsx`, same treatment: add the import, read `const globalCrop = useImagenStore((state) => state.globalCrop)`, and replace its `example={…}`:

```tsx
              example={
                item.originalWidth != null && item.originalHeight != null
                  ? (() => {
                      // TS narrowing does not survive into the closure — assert non-null
                      const dims = { width: item.originalWidth!, height: item.originalHeight! }
                      const rect = effectiveCropRect(item.crop, globalCrop, dims)
                      return {
                        width: rect?.width ?? dims.width,
                        height: rect?.height ?? dims.height,
                      }
                    })()
                  : undefined
              }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ResizeControls.test.tsx src/components/PerImageSettings.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResizeControls.tsx src/components/PerImageSettings.tsx src/components/ResizeControls.test.tsx
git commit -m "feat: resize hints preview against cropped dimensions"
```

---

### Task 12: Final verification

**Files:** none (verification only; fix anything that surfaces).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: every test file passes, zero failures.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. Fix any lint nits (unused imports etc.) and re-run.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: clean Vite build (confirms react-image-crop bundles and the PWA plugin still precaches).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then in the browser:
1. Drop 2+ images of different aspect ratios.
2. Set Crop to 16:9 — thumbnails show centered crops with badges; hint text appears.
3. Open "Adjust crops" — overlay is ratio-locked; drag/resize it; step through images via filmstrip and arrows; per-image ratio override to 1:1; Reset one image; set one to None.
4. Optimize all — outputs have cropped dimensions; compare view stays aligned while dragging the divider.
5. Set a percentage resize and confirm the hint shows cropped→resized numbers.
6. Custom ratio 21:9 works; changing the batch ratio resets all tweaks.

Expected: all behaviors match the spec; no console errors.

- [ ] **Step 5: Commit any verification fixes**

```bash
git status
```

If fixes were needed, commit them with a message describing what was fixed. Otherwise nothing to commit.
