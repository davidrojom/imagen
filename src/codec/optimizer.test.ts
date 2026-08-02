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
    globalCrop: { kind: 'none' },
    cropEditorId: null,
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
        const crop = input.settings.crop?.rect ?? (input.settings.crop?.ratio ? { x: 0, y: 0, width: 10, height: 10 } : undefined)
        return {
          buffer: new ArrayBuffer(bytes),
          outputType: getFormatSpec(input.settings.format).mime,
          width: 12,
          height: 8,
          bytes,
          crop,
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

  it('de-duplicates output filenames across items that resolve to the same name', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['photo.jpg', 'photo.jpg', 'photo.jpg'], 'image/jpeg')

    optimizer.optimizeAll()
    await runToSettled()

    const names = useImagenStore.getState().images.map((i) => i.result!.outputName)
    expect(new Set(names).size).toBe(3)
    expect(names).toEqual(expect.arrayContaining(['photo.webp', 'photo-1.webp', 'photo-2.webp']))
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

  it('snapshots effective settings at enqueue so a mid-batch global format change does not alter enqueued outputs', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png', 'b.png', 'c.png'])

    optimizer.optimizeAll()
    useImagenStore.getState().setGlobalSettings({ format: 'avif' })
    await runToSettled()

    expect(fake.calls.every((c) => c.settings.format === 'webp')).toBe(true)
    const state = useImagenStore.getState()
    expect(state.images.every((i) => i.result!.outputType === 'image/webp')).toBe(true)
    expect(state.images.every((i) => i.result!.outputName.endsWith('.webp'))).toBe(true)
  })

  it("keeps a done item's output type/extension matching the settings it was encoded with despite mid-batch changes", async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id1] = seed(['a.png', 'b.png'])
    useImagenStore.getState().setImageSettings(id1, { format: 'avif' })

    optimizer.optimizeAll()
    useImagenStore.getState().setImageSettings(id1, { format: 'jxl' })
    useImagenStore.getState().setGlobalSettings({ format: 'oxipng' })
    await runToSettled()

    const overridden = useImagenStore.getState().images.find((i) => i.id === id1)!
    expect(overridden.result!.outputType).toBe('image/avif')
    expect(overridden.result!.outputName).toBe('a.avif')
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

  it('optimizeOne re-encodes only the targeted item with its current effective settings', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 2 })
    const [id1, id2] = seed(['a.png', 'b.png'])

    optimizer.optimizeAll()
    await runToSettled()
    const firstUrl = useImagenStore.getState().images.find((i) => i.id === id1)!.result!.url
    const otherUrl = useImagenStore.getState().images.find((i) => i.id === id2)!.result!.url
    const callsBefore = fake.calls.length

    useImagenStore.getState().setImageSettings(id1, { format: 'avif' })
    optimizer.optimizeOne(id1)
    await runToSettled()

    const state = useImagenStore.getState()
    const first = state.images.find((i) => i.id === id1)!
    const second = state.images.find((i) => i.id === id2)!
    expect(fake.calls).toHaveLength(callsBefore + 1)
    expect(fake.calls.at(-1)!.settings.format).toBe('avif')
    expect(first.status).toBe('done')
    expect(first.result!.outputType).toBe('image/avif')
    expect(first.result!.outputName).toBe('a.avif')
    expect(first.result!.url).not.toBe(firstUrl)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl)
    expect(second.result!.url).toBe(otherUrl)
    expect(state.batch).toMatchObject({ status: 'done', total: 1, completed: 1 })
  })

  it('optimizeOne processes a never-encoded item on demand', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])

    optimizer.optimizeOne(id)
    await runToSettled()

    const state = useImagenStore.getState()
    expect(state.images[0].status).toBe('done')
    expect(state.images[0].result).toBeDefined()
    expect(state.batch).toMatchObject({ status: 'done', total: 1, completed: 1 })
  })

  it('optimizeAll is a no-op while a batch is already processing', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png', 'b.png'])

    optimizer.optimizeAll()
    optimizer.optimizeAll()
    await runToSettled()

    expect(fake.calls).toHaveLength(2)
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('creates no result URL when an item reaches a terminal state before its worker completion lands', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])
    const urlCallsAfterSeed = vi.mocked(URL.createObjectURL).mock.calls.length

    optimizer.optimizeAll()
    useImagenStore.getState().markDone(id, {
      blob: new Blob(['external']),
      url: 'blob:external',
      outputType: 'image/webp',
      outputBytes: 8,
      width: 1,
      height: 1,
      outputName: 'a.webp',
    })
    await runToSettled()
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))

    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(urlCallsAfterSeed)
    expect(useImagenStore.getState().images[0].result!.url).toBe('blob:external')
  })

  it('optimizeOne is a no-op while a batch is processing', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const ids = seed(['a.png', 'b.png'])

    optimizer.optimizeAll()
    optimizer.optimizeOne(ids[0])
    await runToSettled()

    expect(fake.calls).toHaveLength(2)
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('completes the batch when a queued item is removed mid-batch', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const ids = seed(['a.png', 'b.png', 'c.png'])

    optimizer.optimizeAll()
    useImagenStore.getState().removeImage(ids[2])
    await runToSettled()

    const state = useImagenStore.getState()
    expect(state.images).toHaveLength(2)
    expect(state.images.every((i) => i.status === 'done')).toBe(true)
    expect(state.batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('completes the batch and creates no result URL when the in-flight item is removed', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const ids = seed(['a.png', 'b.png'])
    const urlCallsAfterSeed = vi.mocked(URL.createObjectURL).mock.calls.length

    optimizer.optimizeAll()
    useImagenStore.getState().removeImage(ids[0])
    await runToSettled()

    const state = useImagenStore.getState()
    expect(state.images).toHaveLength(1)
    expect(state.images[0].status).toBe('done')
    expect(state.batch).toMatchObject({ status: 'done', total: 1, completed: 1 })
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(urlCallsAfterSeed + 1)
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

describe('Optimizer crop snapshots', () => {
  it('sends no crop when globalCrop is none', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png'])
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toBeUndefined()
  })

  it('sends the batch ratio for auto crops', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    seed(['a.png'])
    useImagenStore.getState().setGlobalCrop({ kind: 'ratio', w: 16, h: 9 })
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toEqual({ ratio: { w: 16, h: 9 } })
  })

  it('sends the manual rect when the image has one', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])
    const rect = { x: 5, y: 6, width: 70, height: 80 }
    useImagenStore.getState().setImageCrop(id, { rect })
    optimizer.optimizeAll()
    await runToSettled()
    expect(fake.calls[0].settings.crop).toEqual({ rect })
  })

  it('stores the applied crop rect on the result', async () => {
    const fake = new FakeWorkers()
    const optimizer = new Optimizer({ store: useImagenStore, createWorker: fake.create, poolSize: 1 })
    const [id] = seed(['a.png'])
    const rect = { x: 5, y: 6, width: 70, height: 80 }
    useImagenStore.getState().setImageCrop(id, { rect })
    optimizer.optimizeAll()
    await runToSettled()
    expect(useImagenStore.getState().images[0].result?.cropRect).toEqual(rect)
  })
})
