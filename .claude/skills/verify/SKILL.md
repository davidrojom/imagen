---
name: verify
description: Drive the imagen app in a real browser to verify changes end-to-end (build/launch/drive recipe that works on this machine)
---

# Verifying imagen changes in a real browser

## Launch

```bash
npm run dev   # Vite; picks the next free port if 5173 is busy — read the URL from output
```

## Drive (Playwright against system Chrome)

No playwright in this repo. Install `playwright-core` in a scratch dir and use
system Chrome — no browser download needed:

```js
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true })
```

## Flows and selectors that work

- Upload: `page.setInputFiles('[data-testid="file-input"]', [paths])` (input is hidden; works anyway).
  Fixtures: `test/fixtures/large.png` is 4000×2250 (wide landscape); rotate a copy
  with `sips -r 90` for a portrait.
- Batch aspect ratio: `page.selectOption('[data-testid="crop-ratio-select"]', '1:1')`.
- Open crop editor: first `[data-testid="crop-open-button"]`, then wait for `.ReactCrop img`
  plus ~500ms (pop animation).
- Read zoom/pan state: parse `getComputedStyle(document.querySelector('.react-transform-component')).transform`
  matrix — `a` = scale, `tx/ty` = pan.
- Crop selection relative to image: compare `getBoundingClientRect()` of
  `.ReactCrop__crop-selection` vs `.ReactCrop img`.
- Ctrl+wheel zoom: `page.keyboard.down('Control')` then `page.mouse.wheel(0, -120)` —
  Playwright applies keyboard modifiers to wheel events.
- Touch pinch: CDP `Input.synthesizePinchGesture` on a `newCDPSession(page)` (needs
  `hasTouch: true` on the page).
- Encode pipeline: click first `[data-testid="optimize-button"]`, wait for
  `[data-testid="output-dimensions"]` (WASM encode of a 4000×2250 PNG takes seconds —
  use a 60s timeout).

## Gotchas

- Zoom badge testid: `crop-zoom-badge`; filmstrip nav: `crop-editor-next` / `crop-editor-prev`.
- The crop editor only shows `.ReactCrop` when an aspect ratio is active; ratio "none"
  shows `[data-testid="crop-editor-uncropped"]` instead.
- `react-zoom-pan-pinch` is pinned exactly; the unit tests mock its callback contract,
  so any version bump MUST re-run the browser gesture pass (ctrl+wheel, cmd+wheel,
  pinch, plain-wheel pan, drag-draws-selection).
