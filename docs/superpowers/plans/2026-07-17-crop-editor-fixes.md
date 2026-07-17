# Crop Editor Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five confirmed crop-editor defects (clipped tall images, Free-ratio selection deadlock, resizing filmstrip thumbs, wheel bounce at fit, off-screen zoom badge) and add middle-click-drag panning.

**Architecture:** All fixes are root-cause level, confirmed by live browser instrumentation (see spec). Two files change: `CropEditorModal.tsx` (sizing via ReactCrop's `max-height: inherit` chain, Free full-frame fallback, fixed filmstrip thumbs) and `CropZoomViewport.tsx` (zoom-gated wheel panning, custom middle-drag pan clamped to library bounds).

**Tech Stack:** React 19, TypeScript strict, react-image-crop 11.1.2, react-zoom-pan-pinch 4.0.3, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-17-crop-editor-fixes-design.md`

## Global Constraints

- ReactCrop sizing: the cap goes on the ReactCrop element as `className="max-h-[55dvh]"`; the preview img keeps its existing classes (they are live in the "None" branch).
- Free fallback exactly: `{ unit: '%', x: 0, y: 0, width: 100, height: 100 }`, applied only when `dims` is set, the effective ratio kind is `'free'`, there is no active draft, and no stored rect.
- Filmstrip thumbs: fixed `size-14` box, full image `object-cover`, no crop-preview styles, no `globalCrop` subscription in `FilmstripThumb`.
- Zoom-engagement threshold: single constant `ZOOM_ENGAGED_ABOVE = 1.001` (renamed from `BADGE_VISIBLE_ABOVE`) gates BOTH the badge and wheel panning.
- Library pan config becomes `panning={{ excluded: ['ReactCrop'], allowMiddleClickPan: false, allowRightClickPan: false }}` — our custom handler owns middle-drag so the library must never also pan on middle.
- `setTransform` does not clamp (verified in 4.0.3 source): every custom pan target goes through the exported `clampPan(x, y, bounds)` helper; `bounds` comes from `ref.instance.bounds` (`BoundsType | null`, exported by the library).
- Middle-drag activates only when `button === 1`, not `disabled`, and `ref.instance.state.scale > ZOOM_ENGAGED_ABOVE`. Use `setPointerCapture?.()` (optional call — jsdom lacks it).
- New test id: `crop-zoom-viewport` on the viewport's outer div.
- All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verification before each commit: `npm test && npm run typecheck && npm run lint`.

---

### Task 1: CropEditorModal fixes — sizing, Free fallback, fixed thumbs

**Files:**
- Modify: `src/components/CropEditorModal.tsx`
- Test: `src/components/CropEditorModal.test.tsx`

**Interfaces:**
- Consumes: existing modal internals only.
- Produces: no interface changes; `FilmstripThumb` stops reading `globalCrop`.

- [ ] **Step 1: Add the failing tests**

In `src/components/CropEditorModal.test.tsx`, first extend the `react-image-crop` mock so it exposes `className`: in the mock's prop type add `className?: string`, destructure it, and add this attribute to the mock's outer div (next to `data-aspect`):

```tsx
      data-rc-class={className ?? ''}
```

Then add these three tests inside the describe block, after `'locks the overlay to the batch ratio and seeds the centered crop'`:

```tsx
  it('caps the crop view height on the ReactCrop element (inherit chain)', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-rc-class', 'max-h-[55dvh]')
  })

  it('shows a full-image selection when the free ratio has no stored rect', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'free' })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('react-crop')).toHaveAttribute('data-crop', '0,0,100,100')
  })

  it('keeps filmstrip thumbs at a fixed size regardless of crop', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    useImagenStore.getState().setImageCrop(id1, { rect: { x: 0, y: 0, width: 320, height: 180 } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    for (const thumb of screen.getAllByTestId('crop-filmstrip-thumb')) {
      expect(thumb.className).toContain('size-14')
      expect(thumb.querySelector('img')?.className).toContain('object-cover')
    }
  })
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/CropEditorModal.test.tsx`
Expected: the 3 new tests FAIL (`data-rc-class` empty, `data-crop` = `unset`, thumb class `h-14` not `size-14`); pre-existing tests PASS.

- [ ] **Step 3: Implement the three fixes in `src/components/CropEditorModal.tsx`**

(a) Replace the whole `FilmstripThumb` component with:

```tsx
function FilmstripThumb({
  item,
  active,
  onSelect,
}: {
  item: ImageItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-testid="crop-filmstrip-thumb"
      role="option"
      data-active={active ? 'true' : 'false'}
      aria-selected={active}
      aria-label={`Edit crop for ${item.name}`}
      onClick={onSelect}
      className={`relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg transition-all duration-200 ${
        active ? 'ring-2 ring-ember' : 'opacity-60 ring-1 ring-white/[0.12] hover:opacity-100'
      }`}
    >
      <img src={item.previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
    </button>
  )
}
```

Remove the now-unused imports: `cropPreviewStyles` (the whole `../lib/cropPreview` import) and, if no other use remains in the file, `effectiveCropRect` stays (the modal body still uses it) — only remove imports the compiler flags as unused.

(b) Extend the `displayCrop` fallback (free → full frame):

```tsx
  const displayCrop: PercentCrop | undefined =
    draft && draftFor === item.id
      ? draft
      : dims && storedRect
        ? { unit: '%', ...rectToPercent(storedRect, dims) }
        : dims && ratio.kind === 'free'
          ? // Free with no stored rect: a full-frame selection keeps the crop
            // prop defined (react-image-crop fires onComplete on the
            // undefined→defined transition, which would cancel a fresh drag)
            // and gives handles to shape the crop with.
            { unit: '%', x: 0, y: 0, width: 100, height: 100 }
          : undefined
```

(c) Add the height cap to ReactCrop (the img's own max-h is overridden by
react-image-crop's `max-height: inherit` rule, so the cap must sit on the
`.ReactCrop` root where the inherit chain starts):

```tsx
              <ReactCrop
                className="max-h-[55dvh]"
                crop={displayCrop}
                ...existing props unchanged...
```

- [ ] **Step 4: Run the modal tests**

Run: `npx vitest run src/components/CropEditorModal.test.tsx`
Expected: PASS, including the 3 new tests.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/CropEditorModal.tsx src/components/CropEditorModal.test.tsx
git commit -m "fix: size crop view via ReactCrop inherit chain, free full-frame selection, fixed filmstrip thumbs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CropZoomViewport — zoom-gated wheel pan + middle-drag pan

**Files:**
- Modify: `src/components/CropZoomViewport.tsx`
- Test: `src/components/CropZoomViewport.test.tsx`

**Interfaces:**
- Consumes: `ReactZoomPanPinchContentRef`, `BoundsType` types from `react-zoom-pan-pinch`.
- Produces: named export `clampPan(x: number, y: number, bounds: BoundsType | null): { x: number; y: number }` (unit-tested); outer div gains `data-testid="crop-zoom-viewport"`.

- [ ] **Step 1: Update the mock and add failing tests**

Replace the entire content of `src/components/CropZoomViewport.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useImperativeHandle } from 'react'
import CropZoomViewport, { clampPan } from './CropZoomViewport'

const h = vi.hoisted(() => ({
  setTransformCalls: [] as number[][],
  mockScale: 3,
}))

interface MockTransformState {
  scale: number
  positionX: number
  positionY: number
}

interface MockWrapperProps {
  ref?: React.Ref<unknown>
  children?: React.ReactNode
  minScale?: number
  maxScale?: number
  disabled?: boolean
  wheel?: { activationKeys?: (keys: string[]) => boolean }
  panning?: { excluded?: string[]; allowMiddleClickPan?: boolean; allowRightClickPan?: boolean }
  trackPadPanning?: { disabled?: boolean }
  pinch?: { disabled?: boolean }
  doubleClick?: { mode?: string }
  onTransform?: (ref: unknown, state: MockTransformState) => void
}

vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
    ref,
    children,
    minScale,
    maxScale,
    disabled,
    wheel,
    panning,
    trackPadPanning,
    pinch,
    doubleClick,
    onTransform,
  }: MockWrapperProps) => {
    useImperativeHandle(ref, () => ({
      instance: {
        state: { scale: h.mockScale, positionX: -50, positionY: -40 },
        bounds: {
          minPositionX: -200,
          maxPositionX: 0,
          minPositionY: -150,
          maxPositionY: 0,
          scaleWidthFactor: 0,
          scaleHeightFactor: 0,
        },
      },
      setTransform: (...args: number[]) => h.setTransformCalls.push(args),
    }))
    return (
      <div
        data-testid="transform-wrapper"
        data-min-scale={minScale}
        data-max-scale={maxScale}
        data-disabled={disabled ? 'true' : 'false'}
        data-zoom-on-control={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Control']) ? 'true' : 'false'}
        data-zoom-on-meta={typeof wheel?.activationKeys === 'function' && wheel.activationKeys(['Meta']) ? 'true' : 'false'}
        data-zoom-on-plain-wheel={typeof wheel?.activationKeys === 'function' && wheel.activationKeys([]) ? 'true' : 'false'}
        data-panning-excluded={(panning?.excluded ?? []).join(',')}
        data-allow-middle-pan={panning?.allowMiddleClickPan === false ? 'false' : 'true'}
        data-allow-right-pan={panning?.allowRightClickPan === false ? 'false' : 'true'}
        data-trackpad-panning-disabled={trackPadPanning?.disabled ? 'true' : 'false'}
        data-pinch-disabled={pinch?.disabled ? 'true' : 'false'}
        data-double-click-mode={doubleClick?.mode ?? 'none'}
      >
        <button
          type="button"
          data-testid="simulate-zoom-2x"
          onClick={() => onTransform?.({}, { scale: 2.5, positionX: 0, positionY: 0 })}
        >
          zoom
        </button>
        <button
          type="button"
          data-testid="simulate-zoom-reset"
          onClick={() => onTransform?.({}, { scale: 1, positionX: 0, positionY: 0 })}
        >
          reset
        </button>
        {children}
      </div>
    )
  },
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))

describe('clampPan', () => {
  it('passes through when bounds are null', () => {
    expect(clampPan(123, -456, null)).toEqual({ x: 123, y: -456 })
  })

  it('clamps to the bounds box', () => {
    const bounds = {
      minPositionX: -200,
      maxPositionX: 0,
      minPositionY: -150,
      maxPositionY: 0,
      scaleWidthFactor: 0,
      scaleHeightFactor: 0,
    }
    expect(clampPan(450, -540, bounds)).toEqual({ x: 0, y: -150 })
    expect(clampPan(-300, 25, bounds)).toEqual({ x: -200, y: 0 })
    expect(clampPan(-100, -75, bounds)).toEqual({ x: -100, y: -75 })
  })
})

describe('CropZoomViewport', () => {
  it('renders children inside the transform component', () => {
    render(
      <CropZoomViewport disabled={false}>
        <span data-testid="viewport-child">content</span>
      </CropZoomViewport>,
    )
    expect(screen.getByTestId('transform-component')).toContainElement(
      screen.getByTestId('viewport-child'),
    )
  })

  it('configures the gesture model from the spec', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const wrapper = screen.getByTestId('transform-wrapper')
    expect(wrapper).toHaveAttribute('data-min-scale', '1')
    expect(wrapper).toHaveAttribute('data-max-scale', '8')
    expect(wrapper).toHaveAttribute('data-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-zoom-on-control', 'true')
    expect(wrapper).toHaveAttribute('data-zoom-on-meta', 'true')
    expect(wrapper).toHaveAttribute('data-zoom-on-plain-wheel', 'false')
    expect(wrapper).toHaveAttribute('data-panning-excluded', 'ReactCrop')
    expect(wrapper).toHaveAttribute('data-allow-middle-pan', 'false')
    expect(wrapper).toHaveAttribute('data-allow-right-pan', 'false')
    expect(wrapper).toHaveAttribute('data-pinch-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-double-click-mode', 'reset')
  })

  it('disables the transform wrapper when disabled', () => {
    render(<CropZoomViewport disabled>x</CropZoomViewport>)
    expect(screen.getByTestId('transform-wrapper')).toHaveAttribute('data-disabled', 'true')
  })

  it('shows the zoom badge only while zoomed in', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(screen.getByTestId('crop-zoom-badge')).toHaveTextContent(
      '250% · double-click to reset',
    )

    fireEvent.click(screen.getByTestId('simulate-zoom-reset'))
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()
  })

  it('enables wheel panning only while zoomed in', () => {
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const wrapper = screen.getByTestId('transform-wrapper')
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'true')

    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'false')

    fireEvent.click(screen.getByTestId('simulate-zoom-reset'))
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'true')
  })

  it('pans with middle-drag, clamped to the library bounds', () => {
    h.setTransformCalls.length = 0
    h.mockScale = 3
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const viewport = screen.getByTestId('crop-zoom-viewport')

    fireEvent.pointerDown(viewport, { button: 1, pointerId: 7, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 600, clientY: -400 })
    // origin (-50,-40) + delta (500,-500) = (450,-540) → clamped to (0,-150)
    expect(h.setTransformCalls.at(-1)).toEqual([0, -150, 3, 0])

    fireEvent.pointerUp(viewport, { pointerId: 7 })
    h.setTransformCalls.length = 0
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 300, clientY: 300 })
    expect(h.setTransformCalls).toHaveLength(0)
  })

  it('ignores left-button and not-zoomed middle drags', () => {
    h.setTransformCalls.length = 0
    h.mockScale = 3
    render(<CropZoomViewport disabled={false}>x</CropZoomViewport>)
    const viewport = screen.getByTestId('crop-zoom-viewport')
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 8, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(viewport, { pointerId: 8, clientX: 60, clientY: 60 })
    expect(h.setTransformCalls).toHaveLength(0)

    h.mockScale = 1
    render(<CropZoomViewport disabled={false}>y</CropZoomViewport>)
    const second = screen.getAllByTestId('crop-zoom-viewport').at(-1)!
    fireEvent.pointerDown(second, { button: 1, pointerId: 9, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(second, { pointerId: 9, clientX: 60, clientY: 60 })
    expect(h.setTransformCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/CropZoomViewport.test.tsx`
Expected: FAIL — `clampPan` not exported, `data-trackpad-panning-disabled` is `'false'` at fit, no `crop-zoom-viewport` testid, no middle-drag behavior. (The `configures the gesture model` test also fails until `allowMiddleClickPan/allowRightClickPan` are set.)

- [ ] **Step 3: Implement in `src/components/CropZoomViewport.tsx`**

Replace the entire file with:

```tsx
import { useRef, useState } from 'react'
import {
  TransformComponent,
  TransformWrapper,
  type BoundsType,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'

const MAX_ZOOM = 8
// Animated resets can settle a hair above 1; treat anything at or below this
// as "not zoomed in" — hides the badge and disables wheel/middle-drag panning.
const ZOOM_ENGAGED_ABOVE = 1.001

// Any-of check: the library syncs ctrlKey/metaKey from event modifier flags,
// so this fires for Ctrl+wheel, Cmd+wheel, and trackpad pinch (ctrlKey), while
// plain wheel fails it and falls through to panning.
const isZoomActivationKey = (keys: string[]) => keys.includes('Control') || keys.includes('Meta')

// The library's setTransform does not respect limitToBounds; clamp targets to
// the bounds it computed for the current scale.
export function clampPan(x: number, y: number, bounds: BoundsType | null): { x: number; y: number } {
  if (!bounds) return { x, y }
  return {
    x: Math.min(bounds.maxPositionX, Math.max(bounds.minPositionX, x)),
    y: Math.min(bounds.maxPositionY, Math.max(bounds.minPositionY, y)),
  }
}

interface PanSession {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

/**
 * Magnification viewport for the crop editor. Zoom is a viewing aid only:
 * it scales the rendered crop UI and never touches the stored crop rect.
 * Drag stays reserved for the crop selection (panning excludes ReactCrop);
 * plain wheel and middle-drag pan while zoomed, ctrl/cmd+wheel and pinch
 * zoom, double-click resets.
 */
export default function CropZoomViewport({
  disabled,
  children,
}: {
  disabled: boolean
  children: React.ReactNode
}) {
  const [zoom, setZoom] = useState(1)
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const panSession = useRef<PanSession | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const api = apiRef.current
    if (event.button !== 1 || disabled || !api) return
    if (api.instance.state.scale <= ZOOM_ENGAGED_ABOVE) return
    // Suppress the browser's middle-click autoscroll and own the gesture.
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    panSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: api.instance.state.positionX,
      originY: api.instance.state.positionY,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = panSession.current
    const api = apiRef.current
    if (!session || session.pointerId !== event.pointerId || !api) return
    const target = clampPan(
      session.originX + (event.clientX - session.startX),
      session.originY + (event.clientY - session.startY),
      api.instance.bounds,
    )
    api.setTransform(target.x, target.y, api.instance.state.scale, 0)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panSession.current?.pointerId === event.pointerId) panSession.current = null
  }

  return (
    <div
      data-testid="crop-zoom-viewport"
      className="relative w-full"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <TransformWrapper
        ref={apiRef}
        minScale={1}
        maxScale={MAX_ZOOM}
        limitToBounds
        centerOnInit
        disabled={disabled}
        wheel={{ activationKeys: isZoomActivationKey }}
        trackPadPanning={{ disabled: zoom <= ZOOM_ENGAGED_ABOVE }}
        panning={{ excluded: ['ReactCrop'], allowMiddleClickPan: false, allowRightClickPan: false }}
        pinch={{ disabled: false }}
        doubleClick={{ mode: 'reset' }}
        onTransform={(_, state) => setZoom(state.scale)}
      >
        {/* The library defaults both divs to fit-content, which would defeat
            the preview img's max-w-full clamp on wide images. */}
        <TransformComponent wrapperClass="w-full!" contentClass="w-full! justify-center">
          {children}
        </TransformComponent>
      </TransformWrapper>
      {zoom > ZOOM_ENGAGED_ABOVE && (
        <span
          data-testid="crop-zoom-badge"
          className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-ink backdrop-blur-sm"
        >
          {Math.round(zoom * 100)}% · double-click to reset
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the viewport tests**

Run: `npx vitest run src/components/CropZoomViewport.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all exit 0. Note: `CropEditorModal.test.tsx`'s own `react-zoom-pan-pinch` mock does not implement the ref; the component uses `apiRef.current` behind null guards, so modal tests are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/components/CropZoomViewport.tsx src/components/CropZoomViewport.test.tsx
git commit -m "fix: gate wheel panning on zoom and add middle-drag panning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Browser verification of all six complaints

**Files:** none (verification only, per the project verify skill at `.claude/skills/verify/SKILL.md`).

- [ ] **Step 1:** `npm run dev` (background), note the port.
- [ ] **Step 2:** Drive with Playwright + system Chrome (recipe in the verify skill), using `test/fixtures/large.png` (4000×2250) and a rotated portrait copy:
  1. Ratio 1:1, open editor on the **portrait** image → the whole image is visible (img height ≤ 55dvh, fits the checker), badge appears **inside** the dialog when zoomed.
  2. Ratio Free, open editor → full-image marching-ants selection present; drag a corner handle inward → selection resizes and a rect is stored (store's `crop.rect` set); drag handles back out to full → stored crop returns to none.
  3. Change ratios (1:1 → 21:9 custom) with the editor open → filmstrip thumbs stay 56×56 with unchanged content.
  4. At fit, plain wheel over the image → transform position stays (0,0) — no move-and-bounce; the dialog scrolls if it overflows.
  5. Zoom in on the portrait image → badge visible in-viewport at the top-right of the crop area.
  6. While zoomed: middle-button drag pans, clamped at image edges; left-drag still operates the crop selection. Two-point CDP touch dispatch (two fingers moving together) pans.
- [ ] **Step 3:** Kill the dev server; report results per check.
