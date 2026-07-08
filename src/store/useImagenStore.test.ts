import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectBatchProgress,
  selectEffectiveSettings,
  useImagenStore,
} from './useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'

function makeFile(name: string, type = 'image/jpeg', size = 1000): File {
  const file = new File(['x'.repeat(size)], name, { type })
  return file
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
})

describe('addFiles', () => {
  it('appends items with status "queued" and preserves order', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.png', 'image/png')])
    const { images } = useImagenStore.getState()
    expect(images).toHaveLength(2)
    expect(images.map((i) => i.name)).toEqual(['a.jpg', 'b.png'])
    expect(images.every((i) => i.status === 'queued')).toBe(true)
    expect(images[0].settings).toBeNull()
    expect(images[0].originalBytes).toBe(1000)
    expect(images[0].sourceType).toBe('image/jpeg')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('appends (never replaces) on subsequent adds', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    addFiles([makeFile('b.jpg')])
    expect(useImagenStore.getState().images).toHaveLength(2)
  })
})

describe('removeImage / clearAll', () => {
  it('removes a single image and revokes its object URL', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().removeImage(id)
    const { images } = useImagenStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('b.jpg')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('clears the selection when the selected image is removed', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().select(id)
    useImagenStore.getState().removeImage(id)
    expect(useImagenStore.getState().selectedId).toBeNull()
  })

  it('clearAll empties the grid and resets batch', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    useImagenStore.getState().clearAll()
    const state = useImagenStore.getState()
    expect(state.images).toHaveLength(0)
    expect(state.selectedId).toBeNull()
    expect(state.batch).toEqual({ status: 'idle', total: 0, completed: 0 })
  })
})

describe('settings actions', () => {
  it('setGlobalSettings merges a patch', () => {
    useImagenStore.getState().setGlobalSettings({ quality: 42 })
    expect(useImagenStore.getState().globalSettings.quality).toBe(42)
  })

  it('setImageSettings creates an override from the current global settings', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageSettings(id, { quality: 10 })
    const item = useImagenStore.getState().images[0]
    expect(item.settings).not.toBeNull()
    expect(item.settings!.quality).toBe(10)
    expect(item.settings!.format).toBe(useImagenStore.getState().globalSettings.format)
  })

  it('setImageSettings(id, null) clears the override', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageSettings(id, { quality: 10 })
    useImagenStore.getState().setImageSettings(id, null)
    expect(useImagenStore.getState().images[0].settings).toBeNull()
  })
})

describe('effective settings selector', () => {
  it('returns the global settings when there is no override', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    const effective = selectEffectiveSettings(id)(useImagenStore.getState())
    expect(effective).toBe(useImagenStore.getState().globalSettings)
  })

  it('returns the override when present', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().setImageSettings(id, { quality: 10 })
    const effective = selectEffectiveSettings(id)(useImagenStore.getState())
    expect(effective.quality).toBe(10)
    expect(effective).toBe(useImagenStore.getState().images[0].settings)
  })
})

describe('worker-callback reducers and batch progress', () => {
  function seedTwo() {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    return useImagenStore.getState().images.map((i) => i.id)
  }

  const fakeResult = {
    blob: new Blob(['out']),
    url: 'blob:out',
    outputType: 'image/webp',
    outputBytes: 250,
    width: 100,
    height: 100,
    outputName: 'a.webp',
  }

  it('markProcessing flips status to processing', () => {
    const [id] = seedTwo()
    useImagenStore.getState().markProcessing(id)
    expect(useImagenStore.getState().images[0].status).toBe('processing')
  })

  it('markDone attaches the result and advances batch progress', () => {
    const [id1, id2] = seedTwo()
    useImagenStore.getState().startProcessing()
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'processing', total: 2, completed: 0 })
    useImagenStore.getState().markDone(id1, fakeResult)
    expect(selectBatchProgress(useImagenStore.getState())).toBeCloseTo(0.5)
    expect(useImagenStore.getState().images[0].result?.outputBytes).toBe(250)
    useImagenStore.getState().markDone(id2, { ...fakeResult, outputName: 'b.webp' })
    const state = useImagenStore.getState()
    expect(state.batch.status).toBe('done')
    expect(selectBatchProgress(state)).toBe(1)
  })

  it('markError records the message and counts toward progress', () => {
    const [id1, id2] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markError(id1, 'boom')
    expect(useImagenStore.getState().images[0].status).toBe('error')
    expect(useImagenStore.getState().images[0].error).toBe('boom')
    useImagenStore.getState().markDone(id2, fakeResult)
    expect(useImagenStore.getState().batch.status).toBe('done')
  })

  it('re-optimizing a done item revokes the previous result URL', () => {
    const [id] = seedTwo()
    useImagenStore.getState().markDone(id, fakeResult)
    useImagenStore.getState().markDone(id, { ...fakeResult, url: 'blob:out-2' })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:out')
  })
})
