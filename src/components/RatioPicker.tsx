import { useState } from 'react'
import type { CropRatio } from '../types'

const RATIO_PRESETS = [
  { value: '1:1', w: 1, h: 1 },
  { value: '4:3', w: 4, h: 3 },
  { value: '3:2', w: 3, h: 2 },
  { value: '16:9', w: 16, h: 9 },
  { value: '9:16', w: 9, h: 16 },
] as const

export interface RatioPickerProps {
  value: CropRatio | null
  onChange: (value: CropRatio | null) => void
  label: string
  idPrefix: string
  batchLabel?: string
  disabled?: boolean
}

function parseRatioPart(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function selectionFor(value: CropRatio | null, isCustom: boolean): string {
  if (isCustom) return 'custom'
  if (value === null) return 'batch'
  if (value.kind === 'none') return 'none'
  if (value.kind === 'free') return 'free'
  const preset = RATIO_PRESETS.find((p) => p.w === value.w && p.h === value.h)
  return preset ? preset.value : 'custom'
}

export default function RatioPicker({
  value,
  onChange,
  label,
  idPrefix,
  batchLabel,
  disabled = false,
}: RatioPickerProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')

  // Leave custom mode when the value changes externally to a non-ratio value
  // (e.g. a Reset button or filmstrip navigation swapped the value under us).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (isCustom && (value === null || value.kind !== 'ratio')) setIsCustom(false)
  }

  const selection = selectionFor(value, isCustom)

  const emitCustom = (wRaw: string, hRaw: string) => {
    const w = parseRatioPart(wRaw)
    const h = parseRatioPart(hRaw)
    if (w != null && h != null) onChange({ kind: 'ratio', w, h })
  }

  const onSelect = (next: string) => {
    if (next === 'custom') {
      setIsCustom(true)
      if (value?.kind === 'ratio') {
        setCustomW(String(value.w))
        setCustomH(String(value.h))
      }
      return
    }
    setIsCustom(false)
    if (next === 'batch') return onChange(null)
    if (next === 'none') return onChange({ kind: 'none' })
    if (next === 'free') return onChange({ kind: 'free' })
    const preset = RATIO_PRESETS.find((p) => p.value === next)
    if (preset) onChange({ kind: 'ratio', w: preset.w, h: preset.h })
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <label className="flex flex-col gap-2.5">
        <span className="label">{label}</span>
        <select
          data-testid={`${idPrefix}-ratio-select`}
          value={selection}
          disabled={disabled}
          onChange={(event) => onSelect(event.target.value)}
          className="control-select min-w-36"
        >
          {batchLabel ? <option value="batch">{batchLabel}</option> : null}
          <option value="none">{batchLabel ? 'None' : 'No crop'}</option>
          <option value="free">Free</option>
          {RATIO_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.value}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>

      {selection === 'custom' ? (
        <div className="flex items-end gap-2">
          <label className="flex w-16 flex-col gap-2.5">
            <span className="label">W</span>
            <input
              data-testid={`${idPrefix}-ratio-w`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={customW !== '' ? customW : !isCustom && value?.kind === 'ratio' ? String(value.w) : customW}
              disabled={disabled}
              onChange={(event) => {
                setCustomW(event.target.value)
                emitCustom(event.target.value, customH)
              }}
              className="control font-mono"
            />
          </label>
          <span className="pb-2 text-xs text-ink-faint">:</span>
          <label className="flex w-16 flex-col gap-2.5">
            <span className="label">H</span>
            <input
              data-testid={`${idPrefix}-ratio-h`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={customH !== '' ? customH : !isCustom && value?.kind === 'ratio' ? String(value.h) : customH}
              disabled={disabled}
              onChange={(event) => {
                setCustomH(event.target.value)
                emitCustom(customW, event.target.value)
              }}
              className="control font-mono"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
