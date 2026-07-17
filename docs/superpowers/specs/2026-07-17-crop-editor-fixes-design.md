# Crop Editor Fixes — Design

**Date:** 2026-07-17
**Status:** Approved

Six user-reported issues in the crop editor, investigated to root cause with
live browser instrumentation. Five code changes; one item (two-finger pan)
needs verification only.

## Root causes

1. **Editor preview appears cropped when a ratio is active** (and the zoom
   badge renders off-screen): `react-image-crop`'s stylesheet rule
   `.ReactCrop__child-wrapper > img { max-height: inherit }` (specificity
   0-1-1) overrides the preview img's Tailwind `max-h-[55dvh]` (0-1-0), and
   the inherit chain resolves to `none` because nothing above sets a
   max-height. Tall images render at full content width with unbounded
   height (e.g. 828×1472); the checker container — flex-compressed by the
   modal's max-height and `overflow-hidden` — clips them to a middle slice.
   The badge, anchored `top-2` of the full-height box, sits at y≈-390.
   Latent since the crop editor was built; the "None" branch is unaffected
   because it has no ReactCrop wrapper.
2. **Free ratio cannot select an area**: drawing a selection from scratch
   seeds a 0-size crop via `onChange`; react-image-crop's
   `componentDidUpdate` fires `onComplete` whenever the crop prop
   transitions undefined→defined, so the modal's micro-selection guard
   (`pct.width < 0.5`) immediately clears the draft, returning the crop prop
   to undefined — after which every `onDocPointerMove` bails on `!crop`.
   Deadlock on the first frame of the drag. Presets never hit it because a
   centered stored rect always exists.
3. **Filmstrip thumbs change dimensions with the crop**: `FilmstripThumb`
   derives its width from the crop preview's aspect (measured 100×56 →
   56×56 → 131×56 across ratio changes).
4. **Wheel at fit bounces the image**: `trackPadPanning` is active at scale
   1; the pan applies a temporary offset, then the alignment animation snaps
   back because `limitToBounds` leaves no room. Side effect: the wheel is
   consumed, so the dialog cannot scroll over the image.
5. **Middle-click-drag / two-finger panning missing**: middle-drag does
   nothing today. The library's per-button pan options
   (`allowMiddleClickPan` etc.) share one `panning.excluded` list with
   single-finger touch panning, so relaxing the `ReactCrop` exclusion for
   middle-click would make one-finger touch drags pan instead of operating
   the crop. Two-finger pan-during-pinch is already enabled
   (`pinch.allowPanning` defaults true) — it only felt broken because of
   root cause 1.

## Fixes

**A. Editor sizing** — pass `className="max-h-[55dvh]"` to `<ReactCrop>`;
the library's `max-height: inherit` chain (.ReactCrop → child-wrapper → img)
is its designed sizing mechanism and carries the cap to the img. The img
keeps its own classes (still live in the "None" branch). Fixes 1 and the
badge position; pan bounds become proportionate. Grid cards keep their
intentional crop-preview behavior.

**B. Free-ratio full-frame selection** — in `CropEditorModal`, when the
effective ratio is `free` and there is no draft and no stored rect,
`displayCrop` falls back to `{ unit: '%', x: 0, y: 0, width: 100, height: 100 }`.
The user shapes the crop by dragging the full-frame selection's handles
inward (same adjust-not-draw model as the presets). The crop prop is never
undefined, so the `componentDidUpdate` → `onComplete` deadlock is
structurally impossible. Storing a full-image rect round-trips to "no crop"
(`isFullImage` → undefined), so an untouched Free selection changes nothing.

**C. Fixed filmstrip thumbs** — every thumb is a fixed `size-14` (56×56)
box showing the **full image** cover-fitted (`object-cover`), independent of
crop state. The crop-preview styles and the `globalCrop` subscription leave
`FilmstripThumb`.

**D. No wheel-pan at fit** — `trackPadPanning={{ disabled: zoom <= ZOOM_ENGAGED_ABOVE }}`
in `CropZoomViewport`, reusing the tracked `zoom` state
(`ZOOM_ENGAGED_ABOVE = 1.001`, the renamed badge epsilon — one constant for
"is actually zoomed in"). The library re-reads setup from props on every
render, so the flag is live. At fit the wheel is no longer consumed and the
dialog scrolls naturally.

**E. Middle-click-drag panning** — custom pointer handlers on the viewport
container (~25 lines): pointerdown with `button === 1` while zoomed →
capture the pointer, prevent default (suppresses browser autoscroll);
pointermove → `setTransform(clamped x/y, scale, 0)` clamped to
`ref.instance.bounds` via an exported pure helper `clampToBounds`;
pointerup/cancel → release. Uses a `ReactZoomPanPinchContentRef` ref on
`TransformWrapper`. `setTransform` does not clamp on its own (verified in
source), hence the helper.

**F. Two-finger pan** — no code. Verify after A lands (CDP two-point touch
dispatch): two fingers moving together over the image should pan. Known
limitation stands: a pinch whose first finger lands on the selection may
nudge it slightly before the second finger registers.

## Testing

- Component tests: ReactCrop receives the `max-h-[55dvh]` className (mock
  exposes it); Free-with-no-rect renders a full-image crop (mock's
  `data-crop` = `0,0,100,100`); thumbs carry fixed-size classes and no
  crop-frame styles; `trackPadPanning.disabled` flips false once zoom > 1
  (mock re-reads props per render); `clampToBounds` unit tests.
- Browser verification: re-drive all six complaints against the dev server
  (tall-image fit, Free handle-shaping stores a rect, thumb stability,
  no bounce at fit + dialog scrolls, badge visible on portrait images,
  middle-drag pans clamped, two-finger pan).
