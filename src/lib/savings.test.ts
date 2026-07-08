import { describe, expect, it } from 'vitest'
import { formatBytes, savedBytes, savingsPercent } from './savings'

describe('savingsPercent', () => {
  it('computes the percentage reduction', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(1000, 500)).toBe(50)
  })

  it('returns 0 when the output is the same size', () => {
    expect(savingsPercent(1000, 1000)).toBe(0)
  })

  it('returns a negative value when the output grew (no fake savings)', () => {
    expect(savingsPercent(1000, 1200)).toBe(-20)
  })

  it('returns 0 for invalid or zero original sizes', () => {
    expect(savingsPercent(0, 100)).toBe(0)
    expect(savingsPercent(-5, 100)).toBe(0)
    expect(savingsPercent(Number.NaN, 100)).toBe(0)
  })
})

describe('savedBytes', () => {
  it('returns the byte delta', () => {
    expect(savedBytes(1000, 250)).toBe(750)
    expect(savedBytes(1000, 1200)).toBe(-200)
  })
})

describe('formatBytes', () => {
  it('formats zero and byte-range values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes and megabytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(1073741824)).toBe('1 GB')
  })

  it('treats negative or non-finite sizes as 0 B', () => {
    expect(formatBytes(-10)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})
