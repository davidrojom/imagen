import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob, ZIP_FILENAME } from './zip'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveBlob', () => {
  it('downloads a blob via an anchor and revokes the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:zip')
    const revokeObjectURL = vi.fn()
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    let clickedDownload: string | null = null
    let clickedHref: string | null = null
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        const anchor = document.querySelector('a[download]')
        clickedDownload = anchor?.getAttribute('download') ?? null
        clickedHref = anchor?.getAttribute('href') ?? null
      })

    try {
      saveBlob(new Blob(['zip']), ZIP_FILENAME)
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(clickedDownload).toBe(ZIP_FILENAME)
      expect(clickedHref).toBe('blob:zip')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:zip')
      expect(document.querySelector('a[download]')).toBeNull()
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })
})
