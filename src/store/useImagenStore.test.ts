import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectBatchProgress,
  selectDoneCount,
  selectEffectiveSettings,
  selectErrorCount,
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
    globalCrop: { kind: 'none' },
    cropEditorId: null,
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

  it('infers sourceType from the extension when the browser gives no MIME type', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('photo.jxl', ''), makeFile('shot.avif', '')])
    const [jxl, avif] = useImagenStore.getState().images
    expect(jxl.sourceType).toBe('image/jxl')
    expect(avif.sourceType).toBe('image/avif')
  })

  it('appends (never replaces) on subsequent adds', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    addFiles([makeFile('b.jpg')])
    expect(useImagenStore.getState().images).toHaveLength(2)
  })
})

describe('setImageDimensions', () => {
  it('stores the width and height on the matching item only', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().setImageDimensions(id1, 800, 600)
    const [first, second] = useImagenStore.getState().images
    expect(first.originalWidth).toBe(800)
    expect(first.originalHeight).toBe(600)
    expect(second.id).toBe(id2)
    expect(second.originalWidth).toBeUndefined()
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

  it('setImageSettings affects only the targeted image', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().setImageSettings(id1, { format: 'oxipng' })
    const [first, second] = useImagenStore.getState().images
    expect(first.settings?.format).toBe('oxipng')
    expect(second.settings).toBeNull()
  })

  it('changing global settings does not alter an overridden image', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().setImageSettings(id1, { format: 'avif', quality: 30 })
    useImagenStore.getState().setGlobalSettings({ format: 'mozjpeg', quality: 90 })
    const [overridden] = useImagenStore.getState().images
    expect(overridden.settings?.format).toBe('avif')
    expect(overridden.settings?.quality).toBe(30)
    expect(useImagenStore.getState().globalSettings.format).toBe('mozjpeg')
  })

  it('supports multiple independent overrides simultaneously', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().setImageSettings(id1, { format: 'oxipng' })
    useImagenStore.getState().setImageSettings(id2, { format: 'avif' })
    const [a, b, c] = useImagenStore.getState().images
    expect(a.settings?.format).toBe('oxipng')
    expect(b.settings?.format).toBe('avif')
    expect(c.settings).toBeNull()
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
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markProcessing(id)
    useImagenStore.getState().markDone(id, { ...fakeResult, url: 'blob:out-2' })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:out')
  })

  it('startProcessing re-arms items to queued (retaining prior results) so they can be re-processed', () => {
    const [id] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markProcessing(id)
    useImagenStore.getState().markDone(id, fakeResult)
    expect(useImagenStore.getState().images[0].status).toBe('done')

    useImagenStore.getState().startProcessing()
    const item = useImagenStore.getState().images[0]
    expect(item.status).toBe('queued')
    expect(item.result).toBeDefined()
    expect(useImagenStore.getState().batch.completed).toBe(0)
  })
})

describe('reducer idempotency and unknown-id guards', () => {
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

  it('markProcessing is a no-op for an unknown id', () => {
    seedTwo()
    useImagenStore.getState().markProcessing('missing')
    expect(useImagenStore.getState().images.map((i) => i.status)).toEqual(['queued', 'queued'])
  })

  it('markDone is a no-op for an unknown id and does not advance batch.completed', () => {
    seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markDone('missing', fakeResult)
    expect(useImagenStore.getState().batch.completed).toBe(0)
    expect(useImagenStore.getState().images.every((i) => i.result == null)).toBe(true)
  })

  it('markError is a no-op for an unknown id and does not advance batch.completed', () => {
    seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markError('missing', 'boom')
    expect(useImagenStore.getState().batch.completed).toBe(0)
    expect(useImagenStore.getState().images.every((i) => i.status === 'queued')).toBe(true)
  })

  it('markDone is idempotent for an already-done item (does not double-count)', () => {
    const [id1] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markProcessing(id1)
    useImagenStore.getState().markDone(id1, fakeResult)
    expect(useImagenStore.getState().batch.completed).toBe(1)
    useImagenStore.getState().markDone(id1, { ...fakeResult, url: 'blob:dup' })
    expect(useImagenStore.getState().batch.completed).toBe(1)
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:out')
  })

  it('markError is idempotent for a terminal item and does not overwrite a done result', () => {
    const [id1] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markProcessing(id1)
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markError(id1, 'late error')
    expect(useImagenStore.getState().images[0].status).toBe('done')
    expect(useImagenStore.getState().batch.completed).toBe(1)
  })

  it('batch.completed never exceeds total under duplicate/stale callbacks', () => {
    const [id1, id2] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markDone(id2, { ...fakeResult, url: 'blob:out-b' })
    useImagenStore.getState().markDone(id1, { ...fakeResult, url: 'blob:out-dup' })
    useImagenStore.getState().markError(id2, 'stale')
    const { batch } = useImagenStore.getState()
    expect(batch.completed).toBe(2)
    expect(batch.completed).toBeLessThanOrEqual(batch.total)
    expect(batch.status).toBe('done')
  })

  it('selectDoneCount and selectErrorCount split terminal outcomes', () => {
    const [id1, id2] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markError(id2, 'boom')
    const state = useImagenStore.getState()
    expect(selectDoneCount(state)).toBe(1)
    expect(selectErrorCount(state)).toBe(1)
  })
})

describe('removeImage during batch processing', () => {
  function seedThree() {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')])
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

  it('removing a not-yet-finished item shrinks the batch so remaining completions finish it', () => {
    const [id1, id2, id3] = seedThree()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().removeImage(id3)
    expect(useImagenStore.getState().batch).toMatchObject({
      status: 'processing',
      total: 2,
      completed: 0,
    })
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markDone(id2, { ...fakeResult, url: 'blob:out-b' })
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('removing the last pending item completes the batch immediately', () => {
    const [id1, id2, id3] = seedThree()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markDone(id2, { ...fakeResult, url: 'blob:out-b' })
    useImagenStore.getState().removeImage(id3)
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('removing an already-counted done item keeps the remaining accounting exact', () => {
    const [id1, id2, id3] = seedThree()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().removeImage(id1)
    expect(useImagenStore.getState().batch).toMatchObject({
      status: 'processing',
      total: 2,
      completed: 0,
    })
    useImagenStore.getState().markDone(id2, { ...fakeResult, url: 'blob:out-b' })
    useImagenStore.getState().markError(id3, 'boom')
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 2, completed: 2 })
  })

  it('removing an image added after the batch started leaves the batch untouched', () => {
    const [id1, id2, id3] = seedThree()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().addFiles([makeFile('late.jpg')])
    const late = useImagenStore.getState().images.find((i) => i.name === 'late.jpg')!
    useImagenStore.getState().removeImage(late.id)
    expect(useImagenStore.getState().batch).toMatchObject({
      status: 'processing',
      total: 3,
      completed: 0,
    })
    useImagenStore.getState().markDone(id1, fakeResult)
    useImagenStore.getState().markDone(id2, { ...fakeResult, url: 'blob:out-b' })
    useImagenStore.getState().markDone(id3, { ...fakeResult, url: 'blob:out-c' })
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'done', total: 3, completed: 3 })
  })

  it('removing the only pending item of a batch resets it to idle', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().removeImage(id)
    expect(useImagenStore.getState().batch).toMatchObject({ status: 'idle', total: 0, completed: 0 })
  })
})

describe('startProcessingSingle', () => {
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

  function completeBatch(ids: string[]): void {
    useImagenStore.getState().startProcessing()
    ids.forEach((id, index) => {
      useImagenStore.getState().markProcessing(id)
      useImagenStore.getState().markDone(id, { ...fakeResult, url: `blob:out-${index}` })
    })
  }

  it('requeues only the targeted item and scopes the batch to it', () => {
    const [id1, id2] = seedTwo()
    completeBatch([id1, id2])
    expect(useImagenStore.getState().batch.status).toBe('done')

    useImagenStore.getState().startProcessingSingle(id1)

    const state = useImagenStore.getState()
    const first = state.images.find((i) => i.id === id1)!
    const second = state.images.find((i) => i.id === id2)!
    expect(first.status).toBe('queued')
    expect(first.result).toBeDefined()
    expect(second.status).toBe('done')
    expect(state.batch).toMatchObject({ status: 'processing', total: 1, completed: 0 })
  })

  it('lets the requeued item run through the normal reducers to a 1/1 done batch', () => {
    const [id1, id2] = seedTwo()
    completeBatch([id1, id2])

    useImagenStore.getState().startProcessingSingle(id1)
    useImagenStore.getState().markProcessing(id1)
    useImagenStore.getState().markDone(id1, { ...fakeResult, url: 'blob:out-new' })

    const state = useImagenStore.getState()
    expect(state.images.find((i) => i.id === id1)!.status).toBe('done')
    expect(state.images.find((i) => i.id === id1)!.result!.url).toBe('blob:out-new')
    expect(state.batch).toMatchObject({ status: 'done', total: 1, completed: 1 })
  })

  it('clears a previous error on the requeued item', () => {
    const [id1] = seedTwo()
    useImagenStore.getState().startProcessing()
    useImagenStore.getState().markError(id1, 'decode failed')

    useImagenStore.getState().startProcessingSingle(id1)

    const first = useImagenStore.getState().images.find((i) => i.id === id1)!
    expect(first.status).toBe('queued')
    expect(first.error).toBeUndefined()
  })

  it('ignores unknown ids without touching the batch', () => {
    seedTwo()
    const before = useImagenStore.getState().batch
    useImagenStore.getState().startProcessingSingle('missing')
    expect(useImagenStore.getState().batch).toEqual(before)
  })
})

describe('crop state', () => {
  const sixteenNine = { kind: 'ratio', w: 16, h: 9 } as const
  const rect = { x: 10, y: 10, width: 100, height: 100 }

  it('defaults to no batch crop and a closed editor', () => {
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'none' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })

  it('setGlobalCrop stores the ratio', () => {
    useImagenStore.getState().setGlobalCrop(sixteenNine)
    expect(useImagenStore.getState().globalCrop).toEqual(sixteenNine)
  })

  it('setImageCrop sets and clears one image only', () => {
    const { addFiles, setImageCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    setImageCrop(id1, { rect })
    expect(useImagenStore.getState().images[0].crop).toEqual({ rect })
    expect(useImagenStore.getState().images[1].crop).toBeUndefined()
    setImageCrop(id1, null)
    expect(useImagenStore.getState().images[0].crop).toBeUndefined()
    expect(id2).toBeTruthy()
  })

  it('setGlobalCrop clears all per-image crop state (clean slate)', () => {
    const { addFiles, setImageCrop, setGlobalCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    setImageCrop(id1, { rect })
    setImageCrop(id2, { ratio: { kind: 'free' } })
    setGlobalCrop(sixteenNine)
    expect(useImagenStore.getState().images.every((i) => i.crop === undefined)).toBe(true)
    expect(useImagenStore.getState().globalCrop).toEqual(sixteenNine)
  })

  it('open/close crop editor tracks the active image', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    const id = useImagenStore.getState().images[0].id
    useImagenStore.getState().openCropEditor(id)
    expect(useImagenStore.getState().cropEditorId).toBe(id)
    useImagenStore.getState().closeCropEditor()
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })

  it('removing the image being edited closes the editor', () => {
    const { addFiles } = useImagenStore.getState()
    addFiles([makeFile('a.jpg'), makeFile('b.jpg')])
    const [id1, id2] = useImagenStore.getState().images.map((i) => i.id)
    useImagenStore.getState().openCropEditor(id1)
    useImagenStore.getState().removeImage(id1)
    expect(useImagenStore.getState().cropEditorId).toBeNull()
    useImagenStore.getState().openCropEditor(id2)
    useImagenStore.getState().removeImage(id1) // no-op remove
    expect(useImagenStore.getState().cropEditorId).toBe(id2)
  })

  it('clearAll resets crop state', () => {
    const { addFiles, setGlobalCrop } = useImagenStore.getState()
    addFiles([makeFile('a.jpg')])
    setGlobalCrop(sixteenNine)
    useImagenStore.getState().openCropEditor(useImagenStore.getState().images[0].id)
    useImagenStore.getState().clearAll()
    expect(useImagenStore.getState().globalCrop).toEqual({ kind: 'none' })
    expect(useImagenStore.getState().cropEditorId).toBeNull()
  })
})
