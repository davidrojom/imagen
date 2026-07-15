export type OutputFormat = 'mozjpeg' | 'webp' | 'avif' | 'oxipng' | 'jxl'

export interface ResizeSettings {
  mode: 'none' | 'dimensions' | 'percentage'
  width?: number
  height?: number
  keepAspect?: boolean
  percentage?: number
  fitMethod?: 'stretch' | 'contain'
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type CropRatio =
  | { kind: 'none' }
  | { kind: 'free' }
  | { kind: 'ratio'; w: number; h: number }

export interface CropSettings {
  ratio?: CropRatio // per-image override; absent = follow the batch ratio
  rect?: CropRect // manual rect from the editor; absent = auto-centered
}

export interface EncodeSettings {
  format: OutputFormat
  quality?: number
  effort?: number
  resize: ResizeSettings
  crop?: { rect?: CropRect; ratio?: { w: number; h: number } }
}

export type ImageStatus = 'queued' | 'processing' | 'done' | 'error'

export interface ImageResult {
  blob: Blob
  url: string
  outputType: string
  outputBytes: number
  width: number
  height: number
  outputName: string
  cropRect?: CropRect
}

export interface ImageItem {
  id: string
  file: File
  name: string
  sourceType: string
  originalBytes: number
  originalWidth?: number
  originalHeight?: number
  previewUrl: string
  settings: EncodeSettings | null
  crop?: CropSettings
  status: ImageStatus
  progress?: number
  result?: ImageResult
  error?: string
}
