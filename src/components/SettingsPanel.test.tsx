import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './SettingsPanel'
import { useImagenStore } from '../store/useImagenStore'
import { defaultEncodeSettings } from '../lib/settings'
import type { OutputFormat } from '../types'

function resetStore(format: OutputFormat = 'webp'): void {
  useImagenStore.setState({
    images: [],
    globalSettings: defaultEncodeSettings(format),
    selectedId: null,
    batch: { status: 'idle', total: 0, completed: 0 },
  })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  resetStore()
})

describe('SettingsPanel format selection', () => {
  it('offers all five output formats with WebP selected by default', () => {
    render(<SettingsPanel />)
    const select = screen.getByTestId('format-select') as HTMLSelectElement
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels).toEqual(['JPEG', 'WebP', 'AVIF', 'PNG', 'JPEG XL'])
    expect(select.value).toBe('webp')
  })

  it('changing the format updates the global settings', () => {
    render(<SettingsPanel />)
    fireEvent.change(screen.getByTestId('format-select'), { target: { value: 'avif' } })
    expect(useImagenStore.getState().globalSettings.format).toBe('avif')
  })
})

describe('SettingsPanel quality control (lossy formats)', () => {
  it.each<[OutputFormat, number]>([
    ['mozjpeg', 75],
    ['webp', 75],
    ['avif', 50],
    ['jxl', 75],
  ])('shows an adjustable quality slider with the default for %s', (format, def) => {
    resetStore(format)
    render(<SettingsPanel />)
    const quality = screen.getByTestId('quality-slider') as HTMLInputElement
    expect(quality.value).toBe(String(def))
    expect(screen.queryByTestId('level-slider')).not.toBeInTheDocument()
  })

  it('changing the quality updates the global settings', () => {
    render(<SettingsPanel />)
    fireEvent.change(screen.getByTestId('quality-slider'), { target: { value: '40' } })
    expect(useImagenStore.getState().globalSettings.quality).toBe(40)
  })
})

describe('SettingsPanel optimization-level control (PNG)', () => {
  it('shows an optimization-level control and no quality slider for PNG', () => {
    resetStore('oxipng')
    render(<SettingsPanel />)
    const level = screen.getByTestId('level-slider') as HTMLInputElement
    expect(level.value).toBe('2')
    expect(level.min).toBe('1')
    expect(level.max).toBe('6')
    expect(screen.queryByTestId('quality-slider')).not.toBeInTheDocument()
    expect(screen.getByText(/optimization level/i)).toBeInTheDocument()
  })

  it('changing the optimization level updates the global effort setting', () => {
    resetStore('oxipng')
    render(<SettingsPanel />)
    fireEvent.change(screen.getByTestId('level-slider'), { target: { value: '5' } })
    expect(useImagenStore.getState().globalSettings.effort).toBe(5)
  })
})

describe('SettingsPanel control adaptation on format switch', () => {
  it('toggles which single control is visible when switching lossy <-> PNG', () => {
    render(<SettingsPanel />)
    expect(screen.getByTestId('quality-slider')).toBeInTheDocument()
    expect(screen.queryByTestId('level-slider')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('format-select'), { target: { value: 'oxipng' } })
    expect(screen.queryByTestId('quality-slider')).not.toBeInTheDocument()
    expect(screen.getByTestId('level-slider')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('format-select'), { target: { value: 'mozjpeg' } })
    expect(screen.getByTestId('quality-slider')).toBeInTheDocument()
    expect(screen.queryByTestId('level-slider')).not.toBeInTheDocument()
  })
})

describe('SettingsPanel disabled while processing', () => {
  it('disables the format and quality controls while a batch is processing', () => {
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<SettingsPanel />)
    expect(screen.getByTestId('format-select')).toBeDisabled()
    expect(screen.getByTestId('quality-slider')).toBeDisabled()
  })

  it('disables the optimization-level control while a batch is processing', () => {
    resetStore('oxipng')
    useImagenStore.setState({ batch: { status: 'processing', total: 1, completed: 0 } })
    render(<SettingsPanel />)
    expect(screen.getByTestId('level-slider')).toBeDisabled()
  })
})
