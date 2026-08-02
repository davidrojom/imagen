import { create } from 'zustand'
import type { CropRatio, CropSettings, EncodeSettings, ImageItem, ImageResult } from '../types'
import { defaultEncodeSettings, mergeEncodeSettings, resolveSettings } from '../lib/settings'
import { imageTypeForFile } from '../lib/imageFiles'

export interface BatchState {
  status: 'idle' | 'processing' | 'done'
  total: number
  completed: number
  /** Ids counted in `total` that have not yet reached a terminal state. */
  pendingIds?: string[]
}

export interface ImagenState {
  images: ImageItem[]
  globalSettings: EncodeSettings
  selectedId: string | null
  batch: BatchState
  globalCrop: CropRatio
  cropEditorId: string | null

  addFiles: (files: Iterable<File>) => void
  setImageDimensions: (id: string, width: number, height: number) => void
  removeImage: (id: string) => void
  clearAll: () => void
  setGlobalSettings: (patch: Partial<EncodeSettings>) => void
  setImageSettings: (id: string, patch: Partial<EncodeSettings> | null) => void
  setGlobalCrop: (ratio: CropRatio) => void
  setImageCrop: (id: string, crop: CropSettings | null) => void
  openCropEditor: (id: string) => void
  closeCropEditor: () => void
  select: (id: string | null) => void
  startProcessing: () => void
  startProcessingSingle: (id: string) => void
  markProcessing: (id: string) => void
  markDone: (id: string, result: ImageResult) => void
  markError: (id: string, message: string) => void
}

function genId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `img-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function revokeUrl(url: string | undefined): void {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

function revokeItemUrls(item: ImageItem): void {
  revokeUrl(item.previewUrl)
  revokeUrl(item.result?.url)
}

const initialBatch: BatchState = { status: 'idle', total: 0, completed: 0 }

function advanceBatch(batch: BatchState, id: string): BatchState {
  if (batch.pendingIds && !batch.pendingIds.includes(id)) return batch
  const pendingIds = batch.pendingIds?.filter((pending) => pending !== id)
  const completed =
    batch.total > 0 ? Math.min(batch.total, batch.completed + 1) : batch.completed + 1
  const status = batch.total > 0 && completed >= batch.total ? 'done' : batch.status
  return { ...batch, completed, status, pendingIds }
}

function dropFromBatch(batch: BatchState, item: ImageItem): BatchState {
  if (batch.status !== 'processing' || !batch.pendingIds) return batch
  if (batch.pendingIds.includes(item.id)) {
    const pendingIds = batch.pendingIds.filter((pending) => pending !== item.id)
    const total = batch.total - 1
    if (total === 0) return { ...initialBatch }
    const status = batch.completed >= total ? 'done' : batch.status
    return { ...batch, total, status, pendingIds }
  }
  if (item.status === 'done' || item.status === 'error') {
    const total = batch.total - 1
    if (total === 0) return { ...initialBatch }
    return { ...batch, total, completed: Math.max(0, batch.completed - 1) }
  }
  return batch
}

export const useImagenStore = create<ImagenState>()((set) => ({
  images: [],
  globalSettings: defaultEncodeSettings(),
  selectedId: null,
  batch: { ...initialBatch },
  globalCrop: { kind: 'none' },
  cropEditorId: null,

  addFiles: (files) =>
    set((state) => {
      const added: ImageItem[] = Array.from(files).map((file) => ({
        id: genId(),
        file,
        name: file.name,
        sourceType: imageTypeForFile(file),
        originalBytes: file.size,
        previewUrl: URL.createObjectURL(file),
        settings: null,
        status: 'queued',
      }))
      return { images: [...state.images, ...added] }
    }),

  setImageDimensions: (id, width, height) =>
    set((state) => ({
      images: state.images.map((item) =>
        item.id === id ? { ...item, originalWidth: width, originalHeight: height } : item,
      ),
    })),

  removeImage: (id) =>
    set((state) => {
      const target = state.images.find((item) => item.id === id)
      if (target) revokeItemUrls(target)
      return {
        images: state.images.filter((item) => item.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        cropEditorId: state.cropEditorId === id ? null : state.cropEditorId,
        batch: target ? dropFromBatch(state.batch, target) : state.batch,
      }
    }),

  clearAll: () =>
    set((state) => {
      state.images.forEach(revokeItemUrls)
      return {
        images: [],
        selectedId: null,
        batch: { ...initialBatch },
        globalCrop: { kind: 'none' } as CropRatio,
        cropEditorId: null,
      }
    }),

  setGlobalSettings: (patch) =>
    set((state) => ({ globalSettings: mergeEncodeSettings(state.globalSettings, patch) })),

  setImageSettings: (id, patch) =>
    set((state) => ({
      images: state.images.map((item) => {
        if (item.id !== id) return item
        if (patch === null) return { ...item, settings: null }
        const base = item.settings ?? state.globalSettings
        return { ...item, settings: mergeEncodeSettings(base, patch) }
      }),
    })),

  setGlobalCrop: (ratio) =>
    set((state) => ({
      globalCrop: ratio,
      images: state.images.map((item) => (item.crop ? { ...item, crop: undefined } : item)),
    })),

  setImageCrop: (id, crop) =>
    set((state) => ({
      images: state.images.map((item) =>
        item.id === id ? { ...item, crop: crop ?? undefined } : item,
      ),
    })),

  openCropEditor: (id) => set({ cropEditorId: id }),

  closeCropEditor: () => set({ cropEditorId: null }),

  select: (id) => set({ selectedId: id }),

  startProcessing: () =>
    set((state) => ({
      images: state.images.map((item) => ({
        ...item,
        status: 'queued' as const,
        progress: undefined,
        error: undefined,
      })),
      batch: {
        status: 'processing',
        total: state.images.length,
        completed: 0,
        pendingIds: state.images.map((item) => item.id),
      },
    })),

  startProcessingSingle: (id) =>
    set((state) => {
      const item = state.images.find((entry) => entry.id === id)
      if (!item) return {}
      return {
        images: state.images.map((entry) =>
          entry.id === id
            ? { ...entry, status: 'queued' as const, progress: undefined, error: undefined }
            : entry,
        ),
        batch: { status: 'processing', total: 1, completed: 0, pendingIds: [id] },
      }
    }),

  markProcessing: (id) =>
    set((state) => {
      const item = state.images.find((entry) => entry.id === id)
      if (!item || item.status === 'done' || item.status === 'error') return {}
      return {
        images: state.images.map((entry) =>
          entry.id === id
            ? { ...entry, status: 'processing' as const, progress: 0, error: undefined }
            : entry,
        ),
      }
    }),

  markDone: (id, result) =>
    set((state) => {
      const previous = state.images.find((item) => item.id === id)
      if (!previous || previous.status === 'done' || previous.status === 'error') return {}
      if (previous.result?.url && previous.result.url !== result.url) {
        revokeUrl(previous.result.url)
      }
      const images = state.images.map((item) =>
        item.id === id ? { ...item, status: 'done' as const, progress: 1, result, error: undefined } : item,
      )
      return { images, batch: advanceBatch(state.batch, id) }
    }),

  markError: (id, message) =>
    set((state) => {
      const previous = state.images.find((item) => item.id === id)
      if (!previous || previous.status === 'done' || previous.status === 'error') return {}
      const images = state.images.map((item) =>
        item.id === id ? { ...item, status: 'error' as const, error: message } : item,
      )
      return { images, batch: advanceBatch(state.batch, id) }
    }),
}))

export const selectImages = (state: ImagenState): ImageItem[] => state.images

export const selectImageById =
  (id: string) =>
  (state: ImagenState): ImageItem | undefined =>
    state.images.find((item) => item.id === id)

export const selectEffectiveSettings =
  (id: string) =>
  (state: ImagenState): EncodeSettings => {
    const item = state.images.find((entry) => entry.id === id)
    return item ? resolveSettings(item.settings, state.globalSettings) : state.globalSettings
  }

export const selectBatchProgress = (state: ImagenState): number =>
  state.batch.total === 0 ? 0 : state.batch.completed / state.batch.total

export const selectDoneCount = (state: ImagenState): number =>
  state.images.reduce(
    (count, item) => (item.status === 'done' && item.result ? count + 1 : count),
    0,
  )

export const selectErrorCount = (state: ImagenState): number =>
  state.images.reduce((count, item) => (item.status === 'error' ? count + 1 : count), 0)
