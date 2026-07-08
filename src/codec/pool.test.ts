import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Comlink from 'comlink'
import { CodecPool, computePoolSize } from './pool'

vi.mock('comlink', async (importActual) => {
  const actual = await importActual<typeof import('comlink')>()
  return { ...actual, transfer: vi.fn(actual.transfer) }
})
import type { PoolWorker } from './pool'
import type { ProcessInput, ProcessResult } from './codec.types'
import { defaultEncodeSettings } from '../lib/settings'

interface Deferred {
  promise: Promise<ProcessResult>
  resolve: (result: ProcessResult) => void
  reject: (error: unknown) => void
}

function deferred(): Deferred {
  let resolve!: (result: ProcessResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ProcessResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeResult(bytes = 10): ProcessResult {
  return {
    buffer: new ArrayBuffer(bytes),
    outputType: 'image/webp',
    width: 4,
    height: 4,
    bytes,
  }
}

class FakeWorkerFactory {
  created = 0
  disposed = 0
  active = 0
  maxActive = 0
  maxLive = 0
  pending: Deferred[] = []
  calls: ProcessInput[] = []

  get live(): number {
    return this.created - this.disposed
  }

  create = (): PoolWorker => {
    this.created++
    this.maxLive = Math.max(this.maxLive, this.live)
    let disposedSelf = false
    let inFlight: Deferred | null = null
    return {
      processImage: (input: ProcessInput) => {
        this.calls.push(input)
        this.active++
        this.maxActive = Math.max(this.maxActive, this.active)
        const d = deferred()
        inFlight = d
        this.pending.push(d)
        return d.promise.finally(() => {
          this.active--
          if (inFlight === d) inFlight = null
        })
      },
      dispose: () => {
        if (disposedSelf) return
        disposedSelf = true
        this.disposed++
        // Terminating a worker aborts any in-flight work it was running.
        inFlight?.reject(new Error('worker terminated'))
      },
    }
  }
}

function makeInput(): ProcessInput {
  return { buffer: new ArrayBuffer(8), sourceType: 'image/png', settings: defaultEncodeSettings('webp') }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('computePoolSize', () => {
  it('clamps hardwareConcurrency-1 into [1,4]', () => {
    expect(computePoolSize(1)).toBe(1)
    expect(computePoolSize(2)).toBe(1)
    expect(computePoolSize(3)).toBe(2)
    expect(computePoolSize(5)).toBe(4)
    expect(computePoolSize(16)).toBe(4)
    expect(computePoolSize(0)).toBe(1)
  })
})

describe('CodecPool', () => {
  let factory: FakeWorkerFactory

  beforeEach(() => {
    factory = new FakeWorkerFactory()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bounds concurrency to the pool size', async () => {
    const started: string[] = []
    const pool = new CodecPool({
      size: 2,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onStart: (id) => started.push(id),
    })

    pool.processMany(['a', 'b', 'c', 'd'])
    await flush()

    expect(factory.maxActive).toBe(2)
    expect(factory.created).toBe(2)
    expect(started).toEqual(['a', 'b'])

    factory.pending[0].resolve(makeResult())
    factory.pending[1].resolve(makeResult())
    await flush()

    expect(factory.maxActive).toBe(2)
    expect(started).toEqual(['a', 'b', 'c', 'd'])
  })

  it('processes the whole FIFO queue and emits onDone for each', async () => {
    const done: string[] = []
    const pool = new CodecPool({
      size: 2,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onDone: (id) => done.push(id),
    })

    pool.processMany(['a', 'b', 'c'])
    for (let i = 0; i < 5 && factory.pending.length < 3; i++) {
      // drain deferreds as they are created
      factory.pending.forEach((d) => d.resolve(makeResult()))
      await flush()
    }
    factory.pending.forEach((d) => d.resolve(makeResult()))
    await flush()

    expect(done.sort()).toEqual(['a', 'b', 'c'])
    expect(factory.created).toBe(2)
  })

  it('transfers input ArrayBuffers via Comlink.transfer', async () => {
    const transferSpy = vi.mocked(Comlink.transfer)
    transferSpy.mockClear()
    const input = makeInput()
    const pool = new CodecPool({
      size: 1,
      createWorker: factory.create,
      getInput: () => input,
    })

    pool.processMany(['a'])
    await flush()

    expect(transferSpy).toHaveBeenCalledWith(input, [input.buffer])
    expect(factory.calls[0]).toBe(input)
    factory.pending[0].resolve(makeResult())
    await flush()
  })

  it('emits onError with a message when processing rejects', async () => {
    const errors: Array<{ id: string; message: string }> = []
    const pool = new CodecPool({
      size: 1,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onError: (id, message) => errors.push({ id, message }),
    })

    pool.processMany(['bad'])
    await flush()
    factory.pending[0].reject(new Error('decode failed'))
    await flush()

    expect(errors).toEqual([{ id: 'bad', message: 'decode failed' }])
  })

  it('emits onError when getInput throws, without spawning work', async () => {
    const errors: string[] = []
    const pool = new CodecPool({
      size: 1,
      createWorker: factory.create,
      getInput: () => {
        throw new Error('missing file')
      },
      onError: (id) => errors.push(id),
    })

    pool.processMany(['x'])
    await flush()

    expect(errors).toEqual(['x'])
  })

  it('reuses a freed worker for the next queued item instead of creating more', async () => {
    const done: string[] = []
    const pool = new CodecPool({
      size: 1,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onDone: (id) => done.push(id),
    })

    pool.processMany(['a', 'b'])
    await flush()
    expect(factory.created).toBe(1)
    expect(factory.calls).toHaveLength(1)

    factory.pending[0].resolve(makeResult())
    await flush()
    factory.pending[1].resolve(makeResult())
    await flush()

    expect(factory.created).toBe(1)
    expect(done).toEqual(['a', 'b'])
  })

  it('clear() empties the queue, disposes idle AND in-flight workers, and suppresses late callbacks', async () => {
    const done: string[] = []
    const errors: string[] = []
    const pool = new CodecPool({
      size: 2,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onDone: (id) => done.push(id),
      onError: (id) => errors.push(id),
    })

    pool.processMany(['a', 'b', 'c', 'd'])
    await flush()
    expect(factory.active).toBe(2)
    expect(factory.live).toBe(2)

    pool.clear()

    // clear() must terminate/dispose all in-flight workers, not just empty the queue.
    expect(factory.disposed).toBe(2)
    expect(factory.live).toBe(0)

    // A late resolution of an already-cleared in-flight task must not fire onDone/onError.
    factory.pending[0].resolve(makeResult())
    await flush()

    expect(done).toEqual([])
    expect(errors).toEqual([])
    // The cleared worker is not disposed a second time when its stale promise settles.
    expect(factory.disposed).toBe(2)

    // A fresh batch after clear starts cleanly on brand-new workers.
    pool.processMany(['e'])
    await flush()
    expect(factory.created).toBe(3)
    factory.pending[factory.pending.length - 1].resolve(makeResult())
    await flush()
    expect(done).toEqual(['e'])
  })

  it('never exceeds the pool size in live workers across a clear->restart cycle', async () => {
    const done: string[] = []
    const pool = new CodecPool({
      size: 2,
      createWorker: factory.create,
      getInput: () => makeInput(),
      onDone: (id) => done.push(id),
    })

    // First batch saturates the pool.
    pool.processMany(['a', 'b', 'c', 'd'])
    await flush()
    expect(factory.live).toBe(2)
    expect(factory.maxLive).toBe(2)

    // Clear mid-flight, then immediately restart with a fresh batch.
    pool.clear()
    expect(factory.live).toBe(0)

    pool.processMany(['e', 'f', 'g'])
    await flush()

    // The orphaned workers from the cleared batch must not run alongside the new ones:
    // live workers never exceed the pool size at any point.
    expect(factory.maxLive).toBe(2)
    expect(factory.live).toBe(2)
    expect(factory.maxActive).toBe(2)

    // Drive the restarted batch to completion.
    for (let i = 0; i < 10 && done.length < 3; i++) {
      factory.pending.forEach((d) => d.resolve(makeResult()))
      await flush()
    }
    expect(done.sort()).toEqual(['e', 'f', 'g'])
    // Still bounded after the restarted batch fully drains.
    expect(factory.maxLive).toBe(2)
  })
})
