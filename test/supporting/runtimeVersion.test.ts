import { describe, expect, it } from 'bun:test'
import {
  getRuntimeBuildTime,
  getRuntimeVersion,
  getRuntimeVersionForBackend,
} from 'src/utils/runtimeVersion.js'

describe('runtimeVersion', () => {
  it('falls back cleanly when Bun macro injection is unavailable', () => {
    expect(getRuntimeVersion()).toBe('unknown')
    expect(getRuntimeVersionForBackend()).toBe('0.0.0')
    expect(getRuntimeBuildTime()).toBeUndefined()
  })
})
