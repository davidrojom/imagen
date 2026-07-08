import { downloadZip } from 'client-zip'
import { dedupeFilename } from './filenames'
import type { ImageItem } from '../types'

export const ZIP_FILENAME = 'imagen-export.zip'

export interface ZipEntry {
  name: string
  blob: Blob
  lastModified?: Date
}

export function collectZipEntries(items: Iterable<ImageItem>): ZipEntry[] {
  const taken = new Set<string>()
  const entries: ZipEntry[] = []
  for (const item of items) {
    if (item.status !== 'done' || !item.result) continue
    const name = dedupeFilename(item.result.outputName, taken)
    taken.add(name)
    entries.push({
      name,
      blob: item.result.blob,
      lastModified: Number.isFinite(item.file.lastModified)
        ? new Date(item.file.lastModified)
        : undefined,
    })
  }
  return entries
}

export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const files = entries.map((entry) => ({
    name: entry.name,
    lastModified: entry.lastModified ?? new Date(),
    input: entry.blob,
  }))
  return downloadZip(files).blob()
}

export function zipImages(items: Iterable<ImageItem>): Promise<Blob> {
  return buildZipBlob(collectZipEntries(items))
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadImagesZip(
  items: Iterable<ImageItem>,
  filename = ZIP_FILENAME,
): Promise<void> {
  saveBlob(await zipImages(items), filename)
}
