import { CodecPool, type PoolWorker } from './pool'
import type { ProcessInput, ProcessResult } from './codec.types'
import type { ImagenState } from '../store/useImagenStore'
import { useImagenStore } from '../store/useImagenStore'
import { resolveSettings } from '../lib/settings'
import { uniqueOutputName } from '../lib/filenames'
import type { EncodeSettings, ImageItem } from '../types'
import { cropSnapshot } from '../lib/cropMath'

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
  private readonly snapshots = new Map<string, EncodeSettings>()

  constructor(options: OptimizerOptions) {
    this.store = options.store
    this.pool = new CodecPool({
      size: options.poolSize,
      createWorker: options.createWorker,
      getInput: (id) => this.getInput(id),
      onStart: (id) => this.store.getState().markProcessing(id),
      onDone: (id, result) => this.handleDone(id, result),
      onError: (id, message) => this.handleError(id, message),
    })

    this.store.subscribe((state, prev) => {
      if (prev.images.length > 0 && state.images.length === 0) {
        this.clear()
      }
    })
  }

  private resolveWithCrop(item: ImageItem, state: ImagenState): EncodeSettings {
    return {
      ...resolveSettings(item.settings, state.globalSettings),
      crop: cropSnapshot(item.crop, state.globalCrop),
    }
  }

  optimizeAll(): void {
    const state = this.store.getState()
    const ids = state.images.map((item) => item.id)
    if (ids.length === 0) return
    for (const item of state.images) {
      this.snapshots.set(item.id, this.resolveWithCrop(item, state))
    }
    state.startProcessing()
    this.pool.processMany(ids)
  }

  optimizeOne(id: string): void {
    const state = this.store.getState()
    if (state.batch.status === 'processing') return
    const item = state.images.find((entry) => entry.id === id)
    if (!item) return
    this.snapshots.set(id, this.resolveWithCrop(item, state))
    state.startProcessingSingle(id)
    this.pool.processMany([id])
  }

  clear(): void {
    this.snapshots.clear()
    this.pool.clear()
  }

  private snapshotFor(id: string): EncodeSettings {
    const snapshot = this.snapshots.get(id)
    if (snapshot) return snapshot
    const state = this.store.getState()
    const item = state.images.find((entry) => entry.id === id)
    if (!item) return resolveSettings(null, state.globalSettings)
    return this.resolveWithCrop(item, state)
  }

  private async getInput(id: string): Promise<ProcessInput> {
    const state = this.store.getState()
    const item = state.images.find((entry) => entry.id === id)
    if (!item) throw new Error('Image no longer present')
    const settings = this.snapshotFor(id)
    const buffer = await item.file.arrayBuffer()
    return { buffer, sourceType: item.sourceType, settings }
  }

  private handleDone(id: string, result: ProcessResult): void {
    const state = this.store.getState()
    const item = state.images.find((entry) => entry.id === id)
    if (!item) {
      this.snapshots.delete(id)
      return
    }
    const settings = this.snapshotFor(id)
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
      cropRect: result.crop,
    })
    this.snapshots.delete(id)
  }

  private handleError(id: string, message: string): void {
    this.snapshots.delete(id)
    this.store.getState().markError(id, message)
  }
}

let singleton: Optimizer | null = null

export function getOptimizer(): Optimizer {
  if (!singleton) {
    singleton = new Optimizer({ store: useImagenStore })
  }
  return singleton
}
