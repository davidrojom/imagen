# Crop Editor Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user zoom (1×–8×) and pan inside the crop editor modal via Ctrl/Cmd+wheel, pinch, and wheel-scroll, as a pure viewing aid that never changes the stored crop.

**Architecture:** A new `CropZoomViewport` component wraps the existing `ReactCrop` in `react-zoom-pan-pinch`'s `TransformWrapper`/`TransformComponent`, keyed by image id so navigation resets zoom. Crop math and the zustand store are untouched — `react-image-crop` stores crops in percent and re-measures its bounding box per pointer event, so it stays correct inside a CSS-scaled ancestor.

**Tech Stack:** React 19, TypeScript (strict), zustand, react-image-crop 11, react-zoom-pan-pinch 4.0.3, Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-16-crop-zoom-design.md`

## Global Constraints

- Dependency pinned exactly: `react-zoom-pan-pinch@4.0.3` (semantics below were verified against this version's source).
- Zoom range exactly `minScale={1}` to `maxScale={8}`; fit (1×) is the floor.
- Drag must never pan — `panning.excluded: ['ReactCrop']` (the library matches excluded classes and all their descendants).
- Plain wheel pans, Ctrl/Cmd+wheel and pinch zoom: `wheel={{ wheelDisabled: true, touchPadDisabled: false }}` + `trackPadPanning={{ disabled: false }}`.
- The library auto-injects its CSS — do NOT import any stylesheet from it.
- Its wrapper/content divs default to `width: fit-content`, which defeats the img's `max-w-full` clamp — always pass `wrapperClass="!w-full"` and `contentClass="!w-full justify-center"`.
- Badge copy exactly: `{Math.round(zoom * 100)}% · double-click to reset` (interpunct `·`).
- Test ids: `crop-zoom-badge`, and in mocks `transform-wrapper`, `transform-component`, `simulate-zoom-2x`, `simulate-zoom-reset`.
- All commits: end message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verification commands: `npm test`, `npm run typecheck`, `npm run lint` — all must pass before each commit.

---

### Task 1: `CropZoomViewport` component

**Files:**
- Create: `src/components/CropZoomViewport.tsx`
- Test: `src/components/CropZoomViewport.test.tsx`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Consumes: `react-zoom-pan-pinch` (`TransformWrapper`, `TransformComponent`).
- Produces: `export default function CropZoomViewport(props: { disabled: boolean; children: React.ReactNode }): JSX.Element` — Task 2 imports it as `import CropZoomViewport from './CropZoomViewport'` and mounts it with `key={item.id}` around `ReactCrop`.

- [ ] **Step 1: Install the dependency**

```bash
npm install react-zoom-pan-pinch@4.0.3
```

Expected: `package.json` gains `"react-zoom-pan-pinch": "4.0.3"` under dependencies (exact pin, no caret — if npm writes `^4.0.3`, edit it to `4.0.3` and run `npm install` again).

- [ ] **Step 2: Write the failing test**

Create `src/components/CropZoomViewport.test.tsx` with exactly:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CropZoomViewport from './CropZoomViewport'

interface MockTransformState {
  scale: number
  positionX: number
  positionY: number
}

interface MockWrapperProps {
  children?: React.ReactNode
  minScale?: number
  maxScale?: number
  disabled?: boolean
  wheel?: { wheelDisabled?: boolean; touchPadDisabled?: boolean }
  panning?: { excluded?: string[] }
  trackPadPanning?: { disabled?: boolean }
  pinch?: { disabled?: boolean }
  doubleClick?: { mode?: string }
  onTransform?: (ref: unknown, state: MockTransformState) => void
}

vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
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
  }: MockWrapperProps) => (
    <div
      data-testid="transform-wrapper"
      data-min-scale={minScale}
      data-max-scale={maxScale}
      data-disabled={disabled ? 'true' : 'false'}
      data-wheel-disabled={wheel?.wheelDisabled ? 'true' : 'false'}
      data-touchpad-disabled={wheel?.touchPadDisabled ? 'true' : 'false'}
      data-panning-excluded={(panning?.excluded ?? []).join(',')}
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
  ),
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))

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
    expect(wrapper).toHaveAttribute('data-wheel-disabled', 'true')
    expect(wrapper).toHaveAttribute('data-touchpad-disabled', 'false')
    expect(wrapper).toHaveAttribute('data-panning-excluded', 'ReactCrop')
    expect(wrapper).toHaveAttribute('data-trackpad-panning-disabled', 'false')
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
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/CropZoomViewport.test.tsx`
Expected: FAIL — cannot resolve `./CropZoomViewport`.

- [ ] **Step 4: Write the implementation**

Create `src/components/CropZoomViewport.tsx` with exactly:

```tsx
import { useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

const MAX_ZOOM = 8

/**
 * Magnification viewport for the crop editor. Zoom is a viewing aid only:
 * it scales the rendered crop UI and never touches the stored crop rect.
 * Drag stays reserved for the crop selection (panning excludes ReactCrop);
 * plain wheel pans, ctrl/cmd+wheel and pinch zoom, double-click resets.
 */
export default function CropZoomViewport({
  disabled,
  children,
}: {
  disabled: boolean
  children: React.ReactNode
}) {
  const [zoom, setZoom] = useState(1)

  return (
    <div className="relative w-full">
      <TransformWrapper
        minScale={1}
        maxScale={MAX_ZOOM}
        limitToBounds
        centerOnInit
        disabled={disabled}
        wheel={{ wheelDisabled: true, touchPadDisabled: false }}
        trackPadPanning={{ disabled: false }}
        panning={{ excluded: ['ReactCrop'] }}
        pinch={{ disabled: false }}
        doubleClick={{ mode: 'reset' }}
        onTransform={(_, state) => setZoom(state.scale)}
      >
        {/* The library defaults both divs to fit-content, which would defeat
            the preview img's max-w-full clamp on wide images. */}
        <TransformComponent wrapperClass="!w-full" contentClass="!w-full justify-center">
          {children}
        </TransformComponent>
      </TransformWrapper>
      {zoom > 1.001 && (
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/CropZoomViewport.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/CropZoomViewport.tsx src/components/CropZoomViewport.test.tsx
git commit -m "feat: add CropZoomViewport pan/zoom wrapper for the crop editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Mount the viewport in `CropEditorModal`

**Files:**
- Modify: `src/components/CropEditorModal.tsx` (crop branch, around lines 253–270)
- Test: `src/components/CropEditorModal.test.tsx`

**Interfaces:**
- Consumes: `CropZoomViewport` from Task 1 (`{ disabled: boolean; children: React.ReactNode }`, default export).
- Produces: the crop branch of the modal renders `CropZoomViewport key={item.id} disabled={processing}` around the existing `ReactCrop`. The uncropped branch (`ratio.kind === 'none'`) is unchanged.

- [ ] **Step 1: Add the failing tests**

In `src/components/CropEditorModal.test.tsx`, directly after the existing `vi.mock('react-image-crop', ...)` block (ends line 69), add:

```tsx
vi.mock('react-zoom-pan-pinch', () => ({
  __esModule: true,
  TransformWrapper: ({
    children,
    disabled,
    onTransform,
  }: {
    children?: React.ReactNode
    disabled?: boolean
    onTransform?: (ref: unknown, state: { scale: number; positionX: number; positionY: number }) => void
  }) => (
    <div data-testid="transform-wrapper" data-disabled={disabled ? 'true' : 'false'}>
      <button
        type="button"
        data-testid="simulate-zoom-2x"
        onClick={() => onTransform?.({}, { scale: 2, positionX: 0, positionY: 0 })}
      >
        zoom
      </button>
      {children}
    </div>
  ),
  TransformComponent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}))
```

Then add these tests inside the `describe('CropEditorModal', ...)` block, after the test `'locks the overlay to the batch ratio and seeds the centered crop'`:

```tsx
  it('wraps the crop overlay in the zoom viewport', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('transform-wrapper')).toContainElement(
      screen.getByTestId('react-crop'),
    )
  })

  it('keeps the uncropped notice outside the zoom viewport', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setImageCrop(id1, { ratio: { kind: 'none' } })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    expect(screen.getByTestId('crop-editor-uncropped')).toBeInTheDocument()
    expect(screen.queryByTestId('transform-wrapper')).not.toBeInTheDocument()
  })

  it('disables zoom while a batch is processing', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<CropEditorModal />)
    expect(screen.getByTestId('transform-wrapper')).toHaveAttribute('data-disabled', 'true')
  })

  it('resets zoom when navigating to another image', () => {
    const [id1] = seedTwoImages()
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 1, h: 1 })
    useImagenStore.getState().openCropEditor(id1)
    render(<CropEditorModal />)
    fireEvent.click(screen.getByTestId('simulate-zoom-2x'))
    expect(screen.getByTestId('crop-zoom-badge')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('crop-editor-next'))
    expect(screen.queryByTestId('crop-zoom-badge')).not.toBeInTheDocument()
  })
```

Note: the `resets zoom` test works because `key={item.id}` remounts `CropZoomViewport` (fresh `zoom` state) when the active image changes — the real `TransformWrapper` resets its transform the same way.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/components/CropEditorModal.test.tsx`
Expected: the 4 new tests FAIL (no `transform-wrapper` in the DOM); all pre-existing tests still PASS.

- [ ] **Step 3: Mount the viewport in the modal**

In `src/components/CropEditorModal.tsx`:

Add the import after the `RatioPicker` import (line 14):

```tsx
import CropZoomViewport from './CropZoomViewport'
```

Replace the crop branch (the `) : (` … `)}` block containing `<ReactCrop`):

```tsx
            ) : (
              <ReactCrop
                crop={displayCrop}
                aspect={ratioValue(ratio)}
                disabled={processing}
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
```

with:

```tsx
            ) : (
              <CropZoomViewport key={item.id} disabled={processing}>
                <ReactCrop
                  crop={displayCrop}
                  aspect={ratioValue(ratio)}
                  disabled={processing}
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
              </CropZoomViewport>
            )}
```

- [ ] **Step 4: Run the modal tests to verify they pass**

Run: `npx vitest run src/components/CropEditorModal.test.tsx`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/CropEditorModal.tsx src/components/CropEditorModal.test.tsx
git commit -m "feat: zoom and pan inside the crop editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: End-to-end verification in the running app

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1–2.
- Produces: confirmation that gestures behave per spec in a real browser (jsdom cannot exercise wheel/pinch physics).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Expected: Vite serves on a localhost port.

- [ ] **Step 2: Verify the gesture model in the browser**

Load the app, add a large landscape image (wider than the modal at 55dvh tall) and a portrait image, pick an aspect ratio (e.g. 1:1), and open the crop editor. Check each:

1. At 1×, layout is identical to before the change — the wide image still shrinks to fit the modal width; no badge visible.
2. Ctrl/Cmd + wheel zooms in/out, anchored at the cursor; badge appears with the current percentage.
3. Trackpad pinch zooms (macOS: two-finger pinch on the trackpad).
4. Plain wheel / two-finger scroll pans while zoomed; panning stops at the image bounds; plain wheel does NOT zoom.
5. Dragging on the image draws/moves the crop selection — it never pans, at 1× and while zoomed.
6. The crop selection stays glued to the same image pixels while zooming (zoom never changes the stored crop; the card preview outside the modal is unchanged by zooming).
7. Double-click resets to 1× and the badge disappears.
8. Filmstrip navigation (arrows/thumbs) opens the next image at 1× with no badge.
9. Cannot zoom out below 1×.

- [ ] **Step 3: Touch check (best effort)**

If a touch device or DevTools touch emulation is available: pinch zooms; note whether starting a pinch with one finger on the crop selection nudges the selection (known limitation in the spec — record the observation, do not fix in this plan).

- [ ] **Step 4: Stop the dev server**

Kill the background dev server process.
