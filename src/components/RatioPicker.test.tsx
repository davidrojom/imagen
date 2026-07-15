import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RatioPicker from './RatioPicker'

describe('RatioPicker', () => {
  it('renders the label and reflects a preset value', () => {
    render(
      <RatioPicker value={{ kind: 'ratio', w: 16, h: 9 }} onChange={() => {}} label="Crop" idPrefix="crop" />,
    )
    expect(screen.getByText('Crop')).toBeInTheDocument()
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('16:9')
  })

  it('maps none/free/preset selections to CropRatio values', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'none' }} onChange={onChange} label="Crop" idPrefix="crop" />)
    const select = screen.getByTestId('crop-ratio-select')
    fireEvent.change(select, { target: { value: 'free' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'free' })
    fireEvent.change(select, { target: { value: '1:1' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 1, h: 1 })
    fireEvent.change(select, { target: { value: 'none' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'none' })
  })

  it('shows a batch option that maps to null when batchLabel is given', () => {
    const onChange = vi.fn()
    render(
      <RatioPicker
        value={{ kind: 'ratio', w: 1, h: 1 }}
        onChange={onChange}
        label="Aspect ratio"
        idPrefix="editor"
        batchLabel="Batch (16:9)"
      />,
    )
    expect(screen.getByText('Batch (16:9)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'batch' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('shows batch as the selected value when value is null', () => {
    render(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('batch')
  })

  it('custom selection reveals inputs and only fires when both are valid', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'none' }} onChange={onChange} label="Crop" idPrefix="crop" />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: 'custom' } })
    expect(onChange).not.toHaveBeenCalled()
    const w = screen.getByTestId('crop-ratio-w')
    const h = screen.getByTestId('crop-ratio-h')
    fireEvent.change(w, { target: { value: '21' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(h, { target: { value: '9' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 21, h: 9 })
    fireEvent.change(h, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps showing custom (not the matching preset) while the user edits custom values', () => {
    const onChange = vi.fn()
    render(<RatioPicker value={{ kind: 'ratio', w: 16, h: 9 }} onChange={onChange} label="Crop" idPrefix="crop" />)
    fireEvent.change(screen.getByTestId('crop-ratio-select'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByTestId('crop-ratio-w'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('crop-ratio-h'), { target: { value: '1' } })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'ratio', w: 1, h: 1 })
    expect(screen.getByTestId('crop-ratio-select')).toHaveValue('custom')
  })

  it('allows picking custom while following the batch value', () => {
    render(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'custom' } })
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('custom')
    expect(screen.getByTestId('editor-ratio-w')).toBeInTheDocument()
  })

  it('leaves custom mode when the value is externally reset to batch', () => {
    const { rerender } = render(
      <RatioPicker
        value={{ kind: 'ratio', w: 21, h: 9 }}
        onChange={() => {}}
        label="Aspect ratio"
        idPrefix="editor"
        batchLabel="Batch (16:9)"
      />,
    )
    fireEvent.change(screen.getByTestId('editor-ratio-select'), { target: { value: 'custom' } })
    rerender(
      <RatioPicker value={null} onChange={() => {}} label="Aspect ratio" idPrefix="editor" batchLabel="Batch (16:9)" />,
    )
    expect(screen.getByTestId('editor-ratio-select')).toHaveValue('batch')
  })

  it('disables the controls when disabled', () => {
    render(<RatioPicker value={{ kind: 'none' }} onChange={() => {}} label="Crop" idPrefix="crop" disabled />)
    expect(screen.getByTestId('crop-ratio-select')).toBeDisabled()
  })
})
