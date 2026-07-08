import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Optimizer } from './optimizer'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import { getFormatSpec } from './formats'
import type { PoolWorker } from './pool'
import type { ProcessInput, ProcessResult } from './codec.types'

function resetStore(): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings('webp'),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
}

class FakeWorkers {
  created = 0
  calls: ProcessInput[] = []
  bytesFor: (input: ProcessInput) => number = () => 100
  failFor: (input: ProcessInput) => boolean = () => false

  create = (): PoolWorker => {
    this.created++
    return {
      processImage: async (input: ProcessInput): Promise<ProcessResult> => {
        this.calls.push(input)
        if (this.failFor(input)) throw new Error('decode failed')
        const bytes = this.bytesFor(input)
        return {
          buffer: new ArrayBuffer(bytes),
          outputType: getFormatSpec(input.settings.format).mime,
          width: 12,
          height: 8,
          bytes,
        }
      },
      dispose: () => {},
    }
  }
}

function seed(names: string[], type = 'image/png'): string[] {
  const files = names.map(
    (name) => new File([new Uint8Array([1, 2, 3, 4])], name, { type }),
  )
  useImagenStore.getState().addFiles(files)
  return useImagenStore.getState().images.map((item) => item.id)
}

async function runToSettled(): Promise<void> {
  for (let i = 0; i < 500; i++) {
    await new Promise((r) => setTimeout(r, 0))
    const { batch } = useImagenStore.getState()
    if (batch.total > 0 && batch.completed >= batch.total) return
  }
  throw new Error('batch did not settle')
}

let urlCounter = 0

beforeEach(() => {
  urlCounter = 0
  URL.createObjectURL = vi.fn(() => `blob:out-${++urlCounter}`)
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('Optimizer', () => {
  it('drives every queued item to done and advances the batch to a terminal complete state', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 2 })
    seed(['a.png', 'b.png', 'c.png'])

    optimizer.optimizeAll()
    await runToSettled()

    const state = useImagenStore.getState()
    expect(state.images.every((i) => i.status === 'done')).toBe(true)
    expect(state.batch).toMatchObject({ status: 'done', total: 3, completed: 3 })
    expect(state.images.every((i) => i.result != null)).toBe(true)
  })

  it('builds a result with an object URL, output bytes, dimensions, and a correctly-extensioned name', async () => {
    const fake = new FakeWorkers()
    fake.bytesFor = () => 42
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['photo.jpg'], 'image/jpeg')

    optimizer.optimizeAll()
    await runToSettled()

    const result = useImagenStore.getState().images[0].result!
    expect(result.outputBytes).toBe(42)
    expect(result.outputType).toBe('image/webp')
    expect(result.outputName).toBe('photo.webp')
    expect(result.url).toMatch(/^blob:out-/)
    expect(result.width).toBe(12)
    expect(result.height).toBe(8)
  })

  it('passes the effective per-image settings to the worker (override wins over global)', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 2 })
    const [id1] = seed(['a.png', 'b.png'])
    useImagenStore.getState().setImageSettings(id1, { format: 'avif' })

    optimizer.optimizeAll()
    await runToSettled()

    const formats = fake.calls.map((c) => c.settings.format).sort()
    expect(formats).toEqual(['avif', 'webp'])
    const overridden = useImagenStore.getState().images.find((i) => i.id === id1)!
    expect(overridden.result!.outputName).toBe('a.avif')
    expect(overridden.result!.outputType).toBe('image/avif')
  })

  it('produces smaller output at lower quality (quality is wired through)', async () => {
    const fake = new FakeWorkers()
    fake.bytesFor = (input) => (input.settings.quality ?? 0) * 10
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })

    useImagenStore.getState().setGlobalSettings({ quality: 90 })
    seed(['a.png'])
    optimizer.optimizeAll()
    await runToSettled()
    const high = useImagenStore.getState().images[0].result!.outputBytes

    useImagenStore.getState().setGlobalSettings({ quality: 20 })
    optimizer.optimizeAll()
    await runToSettled()
    const low = useImagenStore.getState().images[0].result!.outputBytes

    expect(low).toBeLessThan(high)
  })

  it('isolates a single failing item without blocking the rest of the batch', async () => {
    const fake = new FakeWorkers()
    fake.failFor = (input) => input.settings.format === 'webp' && false // placeholder
    // fail the item whose file name is bad.png by inspecting nothing here; use size marker instead
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 2 })
    const ids = seed(['good1.png', 'bad.png', 'good2.png'])
    // fail based on buffer marker is not available; fail the second call deterministically
    let call = 0
    fake.failFor = () => {
      call++
      return call === 2
    }

    optimizer.optimizeAll()
    await runToSettled()

    const state = useImagenStore.getState()
    const errored = state.images.filter((i) => i.status === 'error')
    const done = state.images.filter((i) => i.status === 'done')
    expect(errored).toHaveLength(1)
    expect(done).toHaveLength(2)
    expect(state.batch.status).toBe('done')
    expect(state.batch.completed).toBe(3)
    expect(ids).toHaveLength(3)
  })

  it('re-optimizing replaces a done item result in place and revokes the previous URL', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png'])

    optimizer.optimizeAll()
    await runToSettled()
    const firstUrl = useImagenStore.getState().images[0].result!.url
    const countAfterFirst = useImagenStore.getState().images.length

    optimizer.optimizeAll()
    await runToSettled()
    const state = useImagenStore.getState()

    expect(state.images).toHaveLength(countAfterFirst)
    expect(state.images[0].result!.url).not.toBe(firstUrl)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl)
  })

  it('clearing the store mid-batch stops the pool and lets a fresh batch complete', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 2 })
    seed(['a.png', 'b.png', 'c.png', 'd.png'])
    optimizer.optimizeAll()

    useImagenStore.getState().clearAll()
    expect(useImagenStore.getState().images).toHaveLength(0)

    seed(['e.png', 'f.png'])
    optimizer.optimizeAll()
    await runToSettled()

    const state = useImagenStore.getState()
    expect(state.images.map((i) => i.name)).toEqual(['e.png', 'f.png'])
    expect(state.images.every((i) => i.status === 'done')).toBe(true)
    expect(state.batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })
})
