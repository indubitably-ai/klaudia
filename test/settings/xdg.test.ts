import { describe, expect, it } from 'bun:test'
import {
  getUserBinDir,
  getXDGCacheHome,
  getXDGDataHome,
  getXDGStateHome,
} from 'src/utils/xdg.js'

describe('xdg helpers', () => {
  it('uses conventional defaults when XDG env vars are absent', () => {
    const options = { env: {}, homedir: '/Users/tester' }

    expect(getXDGStateHome(options)).toBe('/Users/tester/.local/state')
    expect(getXDGCacheHome(options)).toBe('/Users/tester/.cache')
    expect(getXDGDataHome(options)).toBe('/Users/tester/.local/share')
    expect(getUserBinDir(options)).toBe('/Users/tester/.local/bin')
  })

  it('respects explicit XDG environment overrides', () => {
    const options = {
      env: {
        XDG_STATE_HOME: '/tmp/state',
        XDG_CACHE_HOME: '/tmp/cache',
        XDG_DATA_HOME: '/tmp/data',
      },
      homedir: '/Users/tester',
    }

    expect(getXDGStateHome(options)).toBe('/tmp/state')
    expect(getXDGCacheHome(options)).toBe('/tmp/cache')
    expect(getXDGDataHome(options)).toBe('/tmp/data')
  })
})
