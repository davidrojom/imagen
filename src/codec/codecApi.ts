import * as Comlink from 'comlink'
import type { EncodeSettings, OutputFormat } from '../types'
import type { CodecApi, ProcessInput, ProcessResult } from './codec.types'
import { getFormatSpec } from './formats'
import { computeTargetDimensions } from '../lib/resizeMath'

export function outputMimeFor(format: OutputFormat): string {
  return getFormatSpec(format).mime
}

function resolveQuality(settings: EncodeSettings): number {
  const spec = getFormatSpec(settings.format)
  return settings.quality ?? spec.quality?.default ?? 75
}

function resolveEffort(settings: EncodeSettings): number {
  const spec = getFormatSpec(settings.format)
  return settings.effort ?? spec.effort?.default ?? 0
}

export function mozjpegOptions(settings: EncodeSettings): { quality: number } {
  return { quality: resolveQuality(settings) }
}

export function webpOptions(settings: EncodeSettings): { quality: number; method: number } {
  return { quality: resolveQuality(settings), method: resolveEffort(settings) }
}

export function avifOptions(settings: EncodeSettings): { quality: number; speed: number } {
  return { quality: resolveQuality(settings), speed: resolveEffort(settings) }
}

export function jxlOptions(settings: EncodeSettings): { quality: number; effort: number } {
  return { quality: resolveQuality(settings), effort: resolveEffort(settings) }
}

export function oxipngOptions(settings: EncodeSettings): { level: number } {
  return { level: resolveEffort(settings) }
}

export async function decodeToImageData(buffer: ArrayBuffer, sourceType: string): Promise<ImageData> {
  const blob = new Blob([buffer], { type: sourceType })
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch {
    if (sourceType === 'image/jxl') {
      const { decode } = await import('@jsquash/jxl')
      return decode(buffer)
    }
    const { decode } = await import('@jsquash/avif')
    return (await decode(buffer)) as ImageData
  }
}

async function resizeImage(image: ImageData, settings: EncodeSettings): Promise<ImageData> {
  if (settings.resize.mode === 'none') return image
  const target = computeTargetDimensions(
    { width: image.width, height: image.height },
    settings.resize,
  )
  if (target.width === image.width && target.height === image.height) return image
  const { default: resize } = await import('@jsquash/resize')
  return resize(image, { width: target.width, height: target.height, fitMethod: 'stretch' })
}

async function encodeImage(image: ImageData, settings: EncodeSettings): Promise<ArrayBuffer> {
  switch (settings.format) {
    case 'mozjpeg': {
      const { encode } = await import('@jsquash/jpeg')
      return encode(image, mozjpegOptions(settings))
    }
    case 'webp': {
      const { encode } = await import('@jsquash/webp')
      return encode(image, webpOptions(settings))
    }
    case 'avif': {
      const { encode } = await import('@jsquash/avif')
      return encode(image, avifOptions(settings))
    }
    case 'jxl': {
      const { encode } = await import('@jsquash/jxl')
      return encode(image, jxlOptions(settings))
    }
    case 'oxipng': {
      const { optimise } = await import('@jsquash/oxipng')
      return optimise(image, oxipngOptions(settings))
    }
  }
}

async function processImage(input: ProcessInput): Promise<ProcessResult> {
  const { buffer, sourceType, settings } = input
  const decoded = await decodeToImageData(buffer, sourceType)
  const image = await resizeImage(decoded, settings)
  const output = await encodeImage(image, settings)
  const result: ProcessResult = {
    buffer: output,
    outputType: outputMimeFor(settings.format),
    width: image.width,
    height: image.height,
    bytes: output.byteLength,
  }
  return Comlink.transfer(result, [result.buffer])
}

export const codecApi: CodecApi = { processImage }
