import { CodecPool, type PoolWorker } from './pool'
import type { ProcessInput, ProcessResult } from './codec.types'
import type { ImagenState } from '../store/useImagenStore'
import { useImagenStore } from '../store/useImagenStore'
import { resolveSettings } from '../lib/settings'
import { uniqueOutputName } from '../lib/filenames'

export interface OptimizerLike {
  optimizeAll: () => void
  clear: () => void
}

export interface StoreApi {
  getState: () => ImagenState
  subscribe: (listener: (state: ImagenState, prev: ImagenState) => void) => () => void
}

export interface OptimizerOptions {
  store: StoreApi
  createWorker?: () => PoolWorker
  poolSize?: number
}

export class Optimizer implements OptimizerLike {
  private readonly store: StoreApi
  private readonly pool: CodecPool

  constructor(options: OptimizerOptions) {
    this.store = options.store
    this.pool = new CodecPool({
      size: options.poolSize,
      createWorker: options.createWorker,
      getInput: (id) => this.getInput(id),
      onStart: (id) => this.store.getState().markProcessing(id),
      onDone: (id, result) => this.handleDone(id, result),
      onError: (id, message) => this.store.getState().markError(id, message),
    })

    this.store.subscribe((state, prev) => {
      if (prev.images.length > 0 && state.images.length === 0) {
        this.pool.clear()
      }
    })
  }

  optimizeAll(): void {
    const state = this.store.getState()
    const ids = state.images.map((item) => item.id)
    if (ids.length === 0) return
    state.startProcessing()
    this.pool.processMany(ids)
  }

  clear(): void {
    this.pool.clear()
  }

  private async getInput(id: string): Promise<ProcessInput> {
    const state = this.store.getState()
    const item = state.images.find((entry) => entry.id === id)
    if (!item) throw new Error('Image no longer present')
    const settings = resolveSettings(item.settings, state.globalSettings)
    const buffer = await item.file.arrayBuffer()
    return { buffer, sourceType: item.sourceType, settings }
  }

  private handleDone(id: string, result: ProcessResult): void {
    const state = this.store.getState()
    const item = state.images.find((entry) => entry.id === id)
    if (!item) return
    const settings = resolveSettings(item.settings, state.globalSettings)
    const blob = new Blob([result.buffer], { type: result.outputType })
    const url = URL.createObjectURL(blob)
    const takenNames = state.images
      .filter((entry) => entry.id !== id && entry.result != null)
      .map((entry) => entry.result!.outputName)
    state.markDone(id, {
      blob,
      url,
      outputType: result.outputType,
      outputBytes: result.bytes,
      width: result.width,
      height: result.height,
      outputName: uniqueOutputName(item.name, settings.format, takenNames),
    })
  }
}

let singleton: Optimizer | null = null

export function getOptimizer(): Optimizer {
  if (!singleton) {
    singleton = new Optimizer({ store: useImagenStore })
  }
  return singleton
}
