// Generate Imagen's PWA icons (pwa-192.png, pwa-512.png, maskable-512.png)
// into public/. Deterministic, no external image tooling: RGBA pixels are drawn
// programmatically and encoded to PNG via Node's zlib (same technique as
// test/fixtures/generate.mjs). Run: `node scripts/generate-pwa-icons.mjs`.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import zlib from 'node:zlib'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const chunk = Buffer.alloc(body.length + 8)
  chunk.writeUInt32BE(data.length, 0)
  body.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(body), chunk.length - 4)
  return chunk
}

function encodePng(data, width, height) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [15, 23, 42, 255] // #0f172a
const ACCENT = [56, 189, 248, 255] // #38bdf8
const LIGHT = [248, 250, 252, 255] // #f8fafc

function makeIcon(size, { maskable = false } = {}) {
  const data = new Uint8ClampedArray(size * size * 4)
  const put = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }

  // Background: full-bleed for maskable, rounded-square otherwise.
  const radius = maskable ? 0 : size * 0.2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (radius === 0 || insideRoundedRect(x, y, size, radius)) put(x, y, BG)
    }
  }

  // Content is drawn within a safe inset so maskable icons survive cropping.
  const inset = maskable ? size * 0.18 : size * 0.16
  const cw = size - inset * 2
  const ox = inset
  const oy = inset

  // Sun disc.
  const sunR = cw * 0.13
  const sunX = ox + cw * 0.3
  const sunY = oy + cw * 0.3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - sunX
      const dy = y + 0.5 - sunY
      if (dx * dx + dy * dy <= sunR * sunR) put(x, y, LIGHT)
    }
  }

  // Mountain range (two triangular peaks) anchored to a baseline.
  const baseline = oy + cw * 0.82
  const peaks = [
    { apexX: ox + cw * 0.4, apexY: oy + cw * 0.42, halfW: cw * 0.34 },
    { apexX: ox + cw * 0.72, apexY: oy + cw * 0.55, halfW: cw * 0.3 },
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y + 0.5 > baseline || y + 0.5 < oy) continue
      for (const p of peaks) {
        const t = (baseline - (y + 0.5)) / (baseline - p.apexY)
        if (t < 0 || t > 1) continue
        const half = p.halfW * (1 - t)
        if (Math.abs(x + 0.5 - p.apexX) <= half) {
          put(x, y, ACCENT)
          break
        }
      }
    }
  }

  return data
}

function insideRoundedRect(x, y, size, r) {
  const px = x + 0.5
  const py = y + 0.5
  const min = r
  const max = size - r
  let cx = px
  let cy = py
  if (px < min) cx = min
  else if (px > max) cx = max
  if (py < min) cy = min
  else if (py > max) cy = max
  if (cx === px && cy === py) return true
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

async function emit(name, size, opts) {
  const data = makeIcon(size, opts)
  await writeFile(join(PUBLIC_DIR, name), encodePng(data, size, size))
  console.log(`[icons] wrote ${name} (${size}x${size})`)
}

await emit('pwa-192.png', 192)
await emit('pwa-512.png', 512)
await emit('maskable-512.png', 512, { maskable: true })
console.log('[icons] done.')
