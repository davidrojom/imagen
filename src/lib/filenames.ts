import type { OutputFormat } from '../types'
import { getFormatSpec } from '../codec/formats'

export function replaceExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  return `${base}.${extension}`
}

export function outputFilename(originalName: string, format: OutputFormat): string {
  return replaceExtension(originalName, getFormatSpec(format).extension)
}

export function dedupeFilename(name: string, existing: Iterable<string>): string {
  const taken = existing instanceof Set ? existing : new Set(existing)
  if (!taken.has(name)) return name

  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''

  let counter = 1
  let candidate = `${base}-${counter}${ext}`
  while (taken.has(candidate)) {
    counter += 1
    candidate = `${base}-${counter}${ext}`
  }
  return candidate
}

export function uniqueOutputName(
  originalName: string,
  format: OutputFormat,
  existing: Iterable<string>,
): string {
  return dedupeFilename(outputFilename(originalName, format), existing)
}
