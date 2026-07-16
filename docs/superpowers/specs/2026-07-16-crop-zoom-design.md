# Crop Editor Zoom — Design

**Date:** 2026-07-16
**Status:** Approved

## Goal

Let the user zoom in and out while adjusting a crop in the crop editor modal, so
crop handles can be placed precisely on large images that are otherwise shrunk
to fit the 55dvh preview area.

Zoom is a **viewing aid only**: it magnifies the displayed image and lets the
user pan around it. It never changes the stored crop rect.

## UX behavior

- **Zoom range:** 1× ("fit", identical to today's sizing) to 8×. Fit is the
  floor — zooming all the way out is the reset.
- **Zoom in/out:** Ctrl/Cmd + mouse wheel, or trackpad/touchscreen pinch,
  anchored at the cursor/pinch point.
- **Pan while zoomed:** two-finger trackpad scroll or plain mouse wheel,
  clamped to the image bounds (`limitToBounds`). Dragging never pans — drag
  stays reserved for drawing/moving the crop selection.
- **Reset:** double-click resets to fit. A small passive badge
  ("163% · double-click to reset") shows while zoomed, for orientation and to
  make the reset discoverable.
- Zoom resets when navigating the filmstrip or reopening the editor.
- The uncropped state (aspect ratio "none") keeps its current static preview;
  zoom only applies to the crop view.
- While a batch is processing, zoom/pan is disabled along with the crop
  controls.

## Architecture

- New dependency: `react-zoom-pan-pinch@4.0.3` (peer deps `react: '*'`;
  works with React 19).
- In `src/components/CropEditorModal.tsx`, the crop branch becomes:

  ```tsx
  <TransformWrapper key={item.id} ...>
    <TransformComponent>
      <ReactCrop ...>
        <img ... />
      </ReactCrop>
    </TransformComponent>
  </TransformWrapper>
  ```

  `key={item.id}` remounts the wrapper on filmstrip navigation so zoom resets
  to fit. The checker viewport keeps its fixed max height; the transform
  component fills it.
- **No changes to crop math or the store.** `react-image-crop` re-measures
  `getBoundingClientRect()` on every pointer event and stores crops in
  percent, so its coordinates remain correct inside a CSS-scaled ancestor.
  The existing `onChange`/`onComplete` → `percentToRect` pipeline is
  untouched.

## Gesture configuration

```tsx
<TransformWrapper
  key={item.id}
  minScale={1}
  maxScale={8}
  limitToBounds
  centerOnInit
  disabled={processing}
  wheel={{ wheelDisabled: true, touchPadDisabled: false }}
  trackPadPanning={{ disabled: false }}
  panning={{ excluded: ['ReactCrop'] }}
  pinch={{ disabled: false }}
  doubleClick={{ mode: 'reset' }}
  onTransform={(_, state) => setZoom(state.scale)}
>
```

All semantics below were verified against the 4.0.3 source:

- `wheel.wheelDisabled: true` blocks plain-wheel zoom only for non-ctrlKey
  events; trackpad pinch arrives as a ctrl+wheel event and still zooms
  (`touchPadDisabled: false` applies to ctrlKey events).
- `trackPadPanning` pans on plain wheel/two-finger scroll; its guard skips
  ctrlKey events and only runs when wheel zoom is disallowed, so the two
  never conflict.
- `panning.excluded` matches the excluded class **and all its descendants**,
  so excluding `ReactCrop` alone covers the selection, handles, and image —
  drag always operates the crop, never the pan.
- The library auto-injects its CSS (no manual stylesheet import) and sets
  `pointer-events: none` on images inside the content div; pointer events
  land on ReactCrop's wrapper divs, which is where ReactCrop listens anyway.
- The library's wrapper/content divs default to `width: fit-content`, which
  would defeat the preview img's `max-w-full` clamp for wide images. Override
  with `wrapperClass="!w-full"` and `contentClass="!w-full justify-center"`
  so the img keeps shrinking to the modal width at 1×.
- The zoom badge is driven by the `onTransform` callback feeding a local
  `zoom` state in a dedicated `CropZoomViewport` component
  (`src/components/CropZoomViewport.tsx`), keyed by `item.id` in the modal so
  navigation resets both the transform and the badge.

## Edge cases

- Small images (already displayed at natural size) can still zoom to 8×;
  blurriness at high zoom is expected.
- Known limitation to verify manually: on touchscreens, starting a pinch with
  one finger on the crop selection may nudge the selection before the second
  finger lands. If it is disruptive in practice, a two-pointer guard is the
  follow-up fix.

## Testing

- Component tests in `CropEditorModal.test.tsx`: the crop branch renders
  inside the transform viewport; the zoom badge appears/hides with zoom
  state; the wrapper remounts (zoom resets) on filmstrip navigation; zoom is
  disabled while processing.
- Gesture physics are the library's tested territory and jsdom cannot
  simulate real wheel/pinch interactions, so end-to-end behavior is verified
  by running the dev app after implementation.
