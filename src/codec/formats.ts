import type { OutputFormat } from '../types'

export interface RangeSpec {
  min: number
  max: number
  default: number
}

export interface EffortSpec extends RangeSpec {
  label: string
}

export interface FormatSpec {
  id: OutputFormat
  label: string
  mime: string
  extension: string
  hasQuality: boolean
  quality?: RangeSpec
  effort?: EffortSpec
}

export const FORMATS: Record<OutputFormat, FormatSpec> = {
  mozjpeg: {
    id: 'mozjpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    extension: 'jpg',
    hasQuality: true,
    quality: { min: 0, max: 100, default: 75 },
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    extension: 'webp',
    hasQuality: true,
    quality: { min: 0, max: 100, default: 75 },
    effort: { min: 0, max: 6, default: 4, label: 'Effort' },
  },
  avif: {
    id: 'avif',
    label: 'AVIF',
    mime: 'image/avif',
    extension: 'avif',
    hasQuality: true,
    quality: { min: 0, max: 100, default: 50 },
    effort: { min: 0, max: 10, default: 6, label: 'Speed' },
  },
  oxipng: {
    id: 'oxipng',
    label: 'PNG',
    mime: 'image/png',
    extension: 'png',
    hasQuality: false,
    effort: { min: 1, max: 6, default: 2, label: 'Level' },
  },
  jxl: {
    id: 'jxl',
    label: 'JPEG XL',
    mime: 'image/jxl',
    extension: 'jxl',
    hasQuality: true,
    quality: { min: 0, max: 100, default: 75 },
    effort: { min: 1, max: 9, default: 7, label: 'Effort' },
  },
}

export const FORMAT_IDS: OutputFormat[] = ['mozjpeg', 'webp', 'avif', 'oxipng', 'jxl']

export function getFormatSpec(id: OutputFormat): FormatSpec {
  const spec = FORMATS[id]
  if (!spec) throw new Error(`Unknown output format: ${id}`)
  return spec
}
