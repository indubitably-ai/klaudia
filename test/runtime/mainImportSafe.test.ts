import { describe, expect, it } from 'bun:test'
import { runBunEval } from '../support/index.js'

describe('main import safety', () => {
  it('imports src/main.tsx without OS-level startup reads in safe mode', async () => {
    const result = await runBunEval(`await import('./src/main.tsx')`)

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.traceEvents).toEqual([])
  })
})
