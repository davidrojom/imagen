import type { EncodeSettings, OutputFormat, ResizeSettings } from '../types'
import { getFormatSpec } from '../codec/formats'

export function defaultResizeSettings(): ResizeSettings {
  return { mode: 'none', keepAspect: true }
}

export function defaultEncodeSettings(format: OutputFormat = 'webp'): EncodeSettings {
  const spec = getFormatSpec(format)
  return {
    format,
    quality: spec.hasQuality ? spec.quality!.default : undefined,
    effort: spec.effort ? spec.effort.default : undefined,
    resize: defaultResizeSettings(),
  }
}

export function mergeEncodeSettings(
  base: EncodeSettings,
  patch: Partial<EncodeSettings>,
): EncodeSettings {
  const format = patch.format ?? base.format
  const formatChanged = patch.format != null && patch.format !== base.format
  const spec = getFormatSpec(format)

  const merged: EncodeSettings = {
    ...base,
    ...patch,
    format,
    resize: patch.resize ? { ...base.resize, ...patch.resize } : { ...base.resize },
  }

  if (formatChanged) {
    if (patch.quality === undefined) {
      merged.quality = spec.hasQuality ? spec.quality!.default : undefined
    }
    if (patch.effort === undefined) {
      merged.effort = spec.effort ? spec.effort.default : undefined
    }
  }

  return merged
}

export function resolveSettings(
  override: EncodeSettings | null,
  global: EncodeSettings,
): EncodeSettings {
  return override ?? global
}
