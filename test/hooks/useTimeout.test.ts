import { describe, expect, it, mock, vi } from 'bun:test'
import { importFreshSourceModule } from '../support/index.js'

describe('useTimeout', () => {
  it('elapses after delay', async () => {
    let state = false
    const setState = (value: boolean) => {
      state = value
    }

    mock.module('react', () => ({
      useState: () => [state, setState],
      useEffect: (fn: () => void) => fn(),
    }))

    vi.useFakeTimers()
    try {
      const { useTimeout } = await importFreshSourceModule<typeof import('src/hooks/useTimeout.ts')>(
        'src/hooks/useTimeout.ts',
      )

      const result = useTimeout(100)
      expect(result).toBe(false)

      vi.advanceTimersByTime(100)
      expect(state).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
