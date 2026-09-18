import { describe, it, expect, vi } from 'vitest'
import { updateWithRetry } from './retryUpdate'

// A no-op sleep so tests don't actually wait out the backoff.
const noSleep = () => Promise.resolve()

describe('updateWithRetry', () => {
  it('returns true on the first attempt when it succeeds', async () => {
    const attempt = vi.fn().mockResolvedValue({ error: null })
    expect(await updateWithRetry(attempt, noSleep)).toBe(true)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed attempt and succeeds on a later one', async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ error: 'db down' })
      .mockResolvedValueOnce({ error: null })
    expect(await updateWithRetry(attempt, noSleep)).toBe(true)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('gives up and returns false after 3 total attempts all fail', async () => {
    const attempt = vi.fn().mockResolvedValue({ error: 'db down' })
    expect(await updateWithRetry(attempt, noSleep)).toBe(false)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('waits between attempts using the provided backoff delays', async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ error: 'db down' })
      .mockResolvedValueOnce({ error: 'db down' })
      .mockResolvedValueOnce({ error: null })
    const sleep = vi.fn().mockResolvedValue(undefined)

    expect(await updateWithRetry(attempt, sleep)).toBe(true)
    expect(sleep).toHaveBeenNthCalledWith(1, 200)
    expect(sleep).toHaveBeenNthCalledWith(2, 600)
  })
})
