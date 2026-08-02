const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|bmp|svg|jxl|tiff?)$/i

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  jxl: 'image/jxl',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

export function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/')
  return IMAGE_EXTENSION.test(file.name)
}

export function imageTypeForFile(file: File): string {
  if (file.type) return file.type
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase()
  return (extension && EXTENSION_TYPES[extension]) || ''
}
