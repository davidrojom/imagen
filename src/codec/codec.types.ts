import type { EncodeSettings } from '../types'

export interface ProcessInput {
  buffer: ArrayBuffer
  sourceType: string
  settings: EncodeSettings
}

export interface ProcessResult {
  buffer: ArrayBuffer
  outputType: string
  width: number
  height: number
  bytes: number
}

export interface CodecApi {
  processImage: (input: ProcessInput) => Promise<ProcessResult>
}
