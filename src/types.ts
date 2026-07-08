export type OutputFormat = 'mozjpeg' | 'webp' | 'avif' | 'oxipng' | 'jxl'

export interface ResizeSettings {
  mode: 'none' | 'dimensions' | 'percentage'
  width?: number
  height?: number
  keepAspect?: boolean
  percentage?: number
  fitMethod?: 'stretch' | 'contain'
}

export interface EncodeSettings {
  format: OutputFormat
  quality?: number
  effort?: number
  resize: ResizeSettings
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
  status: ImageStatus
  progress?: number
  result?: ImageResult
  error?: string
}
