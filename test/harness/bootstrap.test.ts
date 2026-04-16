import { describe, expect, it } from 'bun:test'
import { preloadWasApplied } from '../support/state.js'

describe('harness bootstrap', () => {
  it('applies the preload before test files run', () => {
    expect(preloadWasApplied()).toBe(true)
  })

  it('resolves bare src aliases through tsconfig paths', async () => {
    const module = await import('src/utils/frontmatterParser.js')
    expect(typeof module.parseFrontmatter).toBe('function')
  })
})
