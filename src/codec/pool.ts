import * as Comlink from 'comlink'
import type { CodecApi, ProcessInput, ProcessResult } from './codec.types'

export function computePoolSize(hardwareConcurrency?: number): number {
  const cores = hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency ?? 1
  return Math.min(4, Math.max(1, cores - 1))
}

export interface PoolWorker {
  processImage: (input: ProcessInput) => Promise<ProcessResult>
  dispose: () => void
}

export type WorkerFactory = () => PoolWorker

export interface CodecPoolOptions {
  size?: number
  createWorker?: WorkerFactory
  getInput: (id: string) => ProcessInput | Promise<ProcessInput>
  onStart?: (id: string) => void
  onDone?: (id: string, result: ProcessResult) => void
  onError?: (id: string, message: string) => void
}

function defaultCreateWorker(): PoolWorker {
  const worker = new Worker(new URL('./codec.worker.ts', import.meta.url), { type: 'module' })
  const remote = Comlink.wrap<CodecApi>(worker)
  return {
    processImage: (input) => remote.processImage(input),
    dispose: () => {
      remote[Comlink.releaseProxy]()
      worker.terminate()
    },
  }
}

export class CodecPool {
  readonly size: number
  private readonly options: CodecPoolOptions
  private readonly createWorker: WorkerFactory
  private idle: PoolWorker[] = []
  private created = 0
  private queue: string[] = []
  private generation = 0

  constructor(options: CodecPoolOptions) {
    this.options = options
    this.size = options.size ?? computePoolSize()
    this.createWorker = options.createWorker ?? defaultCreateWorker
  }

  processMany(ids: string[]): void {
    this.queue.push(...ids)
    this.pump()
  }

  clear(): void {
    this.generation++
    this.queue = []
    for (const worker of this.idle) worker.dispose()
    this.idle = []
    this.created = 0
  }

  private acquire(): PoolWorker | null {
    const existing = this.idle.pop()
    if (existing) return existing
    if (this.created < this.size) {
      this.created++
      return this.createWorker()
    }
    return null
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const worker = this.acquire()
      if (!worker) break
      const id = this.queue.shift()!
      void this.run(id, worker)
    }
  }

  private async run(id: string, worker: PoolWorker): Promise<void> {
    const generation = this.generation
    this.options.onStart?.(id)
    try {
      const input = await this.options.getInput(id)
      const result = await worker.processImage(Comlink.transfer(input, [input.buffer]))
      if (generation === this.generation) this.options.onDone?.(id, result)
    } catch (error) {
      if (generation === this.generation) {
        this.options.onError?.(id, error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (generation === this.generation) {
        this.idle.push(worker)
        this.pump()
      } else {
        worker.dispose()
      }
    }
  }
}
