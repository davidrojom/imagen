// Reproducibly generate the committed test fixtures used by Imagen's e2e/user-testing.
//
// Run: `npm run fixtures` (or `node test/fixtures/generate.mjs`).
//
// Output (written next to this file, in test/fixtures/):
//   photo.png              PNG (deterministic, via Node zlib)
//   photo.jpg              JPEG carrying EXIF + GPS metadata (for the strip test)
//   photo.webp             WebP
//   photo.gif              GIF (hand-written LZW encoder)
//   photo.avif             AVIF
//   tiny-compressed.webp   very small already-compressed image (non-shrinking savings)
//   large.png              very large-dimension image (long edge >= 4000px)
//   not-an-image.txt       non-image file (for rejection tests)
//
// JPEG/WebP/AVIF are encoded with the project's own jSquash WASM codecs, so no
// external image tooling is required and output is deterministic per codec version.

import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import zlib from 'node:zlib'
import { simd } from 'wasm-feature-detect'

const require = createRequire(import.meta.url)
const OUT_DIR = dirname(fileURLToPath(import.meta.url))
const out = (name) => join(OUT_DIR, name)

const compileWasm = async (spec) =>
  WebAssembly.compile(await readFile(require.resolve(spec)))

// --- RGBA source image (deterministic gradient) ---------------------------

function makeImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = Math.round((x / (width - 1 || 1)) * 255)
      data[i + 1] = Math.round((y / (height - 1 || 1)) * 255)
      data[i + 2] = Math.round((((x + y) % 64) / 63) * 255)
      data[i + 3] = 255
    }
  }
  return { data, width, height, colorSpace: 'srgb' }
}

// --- PNG (raw, via zlib) ---------------------------------------------------

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
  const typeBytes = Buffer.from(type, 'latin1')
  const body = Buffer.concat([typeBytes, data])
  const chunk = Buffer.alloc(body.length + 8)
  chunk.writeUInt32BE(data.length, 0)
  body.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(body), chunk.length - 4)
  return chunk
}

function encodePng({ data, width, height }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// --- GIF (GIF89a, LZW) -----------------------------------------------------

function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let dict = new Map()
  let next = endCode + 1
  const resetDict = () => {
    dict = new Map()
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i)
    next = endCode + 1
    codeSize = minCodeSize + 1
  }

  const bytes = []
  let bitBuffer = 0
  let bitCount = 0
  const emit = (code) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff)
      bitBuffer >>= 8
      bitCount -= 8
    }
  }

  resetDict()
  emit(clearCode)
  let prefix = String(indices[0])
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const combined = prefix + ',' + k
    if (dict.has(combined)) {
      prefix = combined
    } else {
      emit(dict.get(prefix))
      dict.set(combined, next++)
      if (next > 1 << codeSize && codeSize < 12) codeSize++
      if (next > 4095) {
        emit(clearCode)
        resetDict()
      }
      prefix = String(k)
    }
  }
  emit(dict.get(prefix))
  emit(endCode)
  if (bitCount > 0) bytes.push(bitBuffer & 0xff)
  return bytes
}

function encodeGif(width, height) {
  const palette = [
    [15, 23, 42],
    [56, 189, 248],
    [248, 250, 252],
    [244, 63, 94],
  ]
  const minCodeSize = 2 // palette size 4 -> code size 2
  const indices = new Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      indices[y * width + x] = (x + y) % palette.length
    }
  }

  const header = Buffer.from('GIF89a', 'latin1')
  const lsd = Buffer.alloc(7)
  lsd.writeUInt16LE(width, 0)
  lsd.writeUInt16LE(height, 2)
  lsd[4] = 0x80 | ((1 << 4) - 0) | 0x01 // GCT present, colorRes, GCT size = 2^(1+1)=4
  lsd[5] = 0 // background color index
  lsd[6] = 0 // pixel aspect ratio
  const gct = Buffer.alloc(palette.length * 3)
  palette.forEach(([r, g, b], i) => {
    gct[i * 3] = r
    gct[i * 3 + 1] = g
    gct[i * 3 + 2] = b
  })

  const imageDescriptor = Buffer.alloc(10)
  imageDescriptor[0] = 0x2c
  imageDescriptor.writeUInt16LE(0, 1)
  imageDescriptor.writeUInt16LE(0, 3)
  imageDescriptor.writeUInt16LE(width, 5)
  imageDescriptor.writeUInt16LE(height, 7)
  imageDescriptor[9] = 0 // no local color table

  const lzw = lzwEncode(indices, minCodeSize)
  const subBlocks = [Buffer.from([minCodeSize])]
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.slice(i, i + 255)
    subBlocks.push(Buffer.from([chunk.length, ...chunk]))
  }
  subBlocks.push(Buffer.from([0x00])) // block terminator

  return Buffer.concat([
    header,
    lsd,
    gct,
    imageDescriptor,
    ...subBlocks,
    Buffer.from([0x3b]), // trailer
  ])
}

// --- EXIF + GPS APP1 segment, injected into a JPEG ------------------------

function buildExifApp1() {
  const tiff = Buffer.alloc(148)
  const wU16 = (v, o) => tiff.writeUInt16LE(v, o)
  const wU32 = (v, o) => tiff.writeUInt32LE(v, o)
  const entry = (o, tag, type, count, valueWriter) => {
    wU16(tag, o)
    wU16(type, o + 2)
    wU32(count, o + 4)
    valueWriter(o + 8)
  }

  // TIFF header (little-endian)
  tiff.write('II', 0, 'latin1')
  wU16(0x002a, 2)
  wU32(8, 4) // IFD0 offset

  // IFD0: Make (0x010F) + GPS IFD pointer (0x8825)
  wU16(2, 8) // entry count
  entry(10, 0x010f, 2, 7, (o) => wU32(38, o)) // Make -> ASCII at 38
  entry(22, 0x8825, 4, 1, (o) => wU32(46, o)) // GPS IFD at 46
  wU32(0, 34) // next IFD offset
  tiff.write('Imagen\0', 38, 'latin1')

  // GPS IFD at 46: LatRef, Lat, LonRef, Lon
  wU16(4, 46) // entry count
  entry(48, 0x0001, 2, 2, (o) => tiff.write('N\0', o, 'latin1')) // GPSLatitudeRef
  entry(60, 0x0002, 5, 3, (o) => wU32(100, o)) // GPSLatitude -> rationals at 100
  entry(72, 0x0003, 2, 2, (o) => tiff.write('E\0', o, 'latin1')) // GPSLongitudeRef
  entry(84, 0x0004, 5, 3, (o) => wU32(124, o)) // GPSLongitude -> rationals at 124
  wU32(0, 96) // next IFD offset

  // Rational values (numerator, denominator) little-endian
  const rationals = [
    [37, 1], [48, 1], [30, 1], // latitude  37° 48' 30"
    [122, 1], [19, 1], [45, 1], // longitude 122° 19' 45"
  ]
  rationals.forEach(([num, den], i) => {
    wU32(num, 100 + i * 8)
    wU32(den, 100 + i * 8 + 4)
  })

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const app1 = Buffer.alloc(payload.length + 4)
  app1[0] = 0xff
  app1[1] = 0xe1
  app1.writeUInt16BE(payload.length + 2, 2) // segment length (big-endian)
  payload.copy(app1, 4)
  return app1
}

function injectExif(jpeg) {
  const buf = Buffer.from(jpeg)
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (missing SOI)')
  return Buffer.concat([buf.subarray(0, 2), buildExifApp1(), buf.subarray(2)])
}

// Minimal EXIF/GPS self-check so a broken segment fails generation loudly.
function assertGps(jpeg) {
  const buf = Buffer.from(jpeg)
  let i = 2
  let app1 = null
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xda) break // start of scan
    const len = buf.readUInt16BE(i + 2)
    if (marker === 0xe1 && buf.toString('latin1', i + 4, i + 10) === 'Exif\0\0') {
      app1 = buf.subarray(i + 10, i + 2 + len)
      break
    }
    i += 2 + len
  }
  if (!app1) throw new Error('EXIF APP1 segment not found after injection')
  const ifd0Off = app1.readUInt32LE(4)
  const count = app1.readUInt16LE(ifd0Off)
  let gpsOff = null
  for (let e = 0; e < count; e++) {
    const eo = ifd0Off + 2 + e * 12
    if (app1.readUInt16LE(eo) === 0x8825) gpsOff = app1.readUInt32LE(eo + 8)
  }
  if (gpsOff == null) throw new Error('GPS IFD pointer (0x8825) not found in IFD0')
  const gpsCount = app1.readUInt16LE(gpsOff)
  const tags = new Set()
  for (let e = 0; e < gpsCount; e++) tags.add(app1.readUInt16LE(gpsOff + 2 + e * 12))
  for (const t of [0x0001, 0x0002, 0x0003, 0x0004]) {
    if (!tags.has(t)) throw new Error(`GPS tag 0x${t.toString(16)} missing`)
  }
}

// --- jSquash encoders (compiled from local wasm) ---------------------------

async function encodeJpeg(image) {
  const { init, default: encode } = await import('@jsquash/jpeg/encode.js')
  await init(await compileWasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'))
  return Buffer.from(await encode(image, { quality: 82 }))
}

async function encodeWebp(image, options) {
  const { init, default: encode } = await import('@jsquash/webp/encode.js')
  const file = (await simd()) ? 'webp_enc_simd.wasm' : 'webp_enc.wasm'
  await init(await compileWasm(`@jsquash/webp/codec/enc/${file}`))
  return Buffer.from(await encode(image, options))
}

async function encodeAvif(image) {
  const { init, default: encode } = await import('@jsquash/avif/encode.js')
  await init(await compileWasm('@jsquash/avif/codec/enc/avif_enc.wasm'))
  return Buffer.from(await encode(image, { quality: 50, speed: 6 }))
}

// --- Generate --------------------------------------------------------------

async function main() {
  const photo = makeImage(96, 64)

  const written = []
  const emit = async (name, bytes) => {
    await writeFile(out(name), bytes)
    written.push([name, bytes.length])
  }

  await emit('photo.png', encodePng(photo))

  const jpeg = injectExif(await encodeJpeg(photo))
  assertGps(jpeg)
  await emit('photo.jpg', jpeg)

  await emit('photo.webp', await encodeWebp(photo, { quality: 80 }))
  await emit('photo.gif', encodeGif(96, 64))
  await emit('photo.avif', await encodeAvif(photo))

  // Very small, already-compressed image: re-optimizing it should not shrink it.
  await emit('tiny-compressed.webp', await encodeWebp(makeImage(8, 8), { quality: 90 }))

  // Very large-dimension image (long edge >= 4000px).
  await emit('large.png', encodePng(makeImage(4000, 2250)))

  await emit(
    'not-an-image.txt',
    Buffer.from('This is a plain text file, not an image. Used for rejection tests.\n'),
  )

  const width = Math.max(...written.map(([n]) => n.length))
  for (const [name, size] of written) {
    console.log(`${name.padEnd(width)}  ${size.toLocaleString()} bytes`)
  }
}

await main()
