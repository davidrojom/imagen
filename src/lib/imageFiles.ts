const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|bmp|svg|jxl|tiff?)$/i

export function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/')
  return IMAGE_EXTENSION.test(file.name)
}
