import { create } from 'zustand'
import type { EncodeSettings, ImageItem, ImageResult } from '../types'
import { defaultEncodeSettings, mergeEncodeSettings, resolveSettings } from '../lib/settings'

export interface BatchState {
  status: 'idle' | 'processing' | 'done'
  total: number
  completed: number
}

export interface ImagenState {
  images: ImageItem[]
  globalSettings: EncodeSettings
  selectedId: string | null
  batch: BatchState

  addFiles: (files: Iterable<File>) => void
  setImageDimensions: (id: string, width: number, height: number) => void
  removeImage: (id: string) => void
  clearAll: () => void
  setGlobalSettings: (patch: Partial<EncodeSettings>) => void
  setImageSettings: (id: string, patch: Partial<EncodeSettings> | null) => void
  select: (id: string | null) => void
  startProcessing: () => void
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

export const useImagenStore = create<ImagenState>()((set) => ({
  images: [],
  globalSettings: defaultEncodeSettings(),
  selectedId: null,
  batch: { ...initialBatch },

  addFiles: (files) =>
    set((state) => {
      const added: ImageItem[] = Array.from(files).map((file) => ({
        id: genId(),
        file,
        name: file.name,
        sourceType: file.type,
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
      }
    }),

  clearAll: () =>
    set((state) => {
      state.images.forEach(revokeItemUrls)
      return { images: [], selectedId: null, batch: { ...initialBatch } }
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

  select: (id) => set({ selectedId: id }),

  startProcessing: () =>
    set((state) => ({
      images: state.images.map((item) => ({
        ...item,
        status: 'queued' as const,
        progress: undefined,
        error: undefined,
      })),
      batch: { status: 'processing', total: state.images.length, completed: 0 },
    })),

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
      const completed =
        state.batch.total > 0
          ? Math.min(state.batch.total, state.batch.completed + 1)
          : state.batch.completed + 1
      const status =
        state.batch.total > 0 && completed >= state.batch.total ? 'done' : state.batch.status
      return { images, batch: { ...state.batch, completed, status } }
    }),

  markError: (id, message) =>
    set((state) => {
      const previous = state.images.find((item) => item.id === id)
      if (!previous || previous.status === 'done' || previous.status === 'error') return {}
      const images = state.images.map((item) =>
        item.id === id ? { ...item, status: 'error' as const, error: message } : item,
      )
      const completed =
        state.batch.total > 0
          ? Math.min(state.batch.total, state.batch.completed + 1)
          : state.batch.completed + 1
      const status =
        state.batch.total > 0 && completed >= state.batch.total ? 'done' : state.batch.status
      return { images, batch: { ...state.batch, completed, status } }
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
