import { describe, expect, it } from 'bun:test'
import {
  clearPluginSettingsBase,
  getCachedSettingsForSource,
  getPluginSettingsBase,
  getSessionSettingsCache,
  resetSettingsCache,
  setCachedSettingsForSource,
  setPluginSettingsBase,
  setSessionSettingsCache,
} from 'src/utils/settings/settingsCache.js'

describe('settingsCache', () => {
  it('stores and clears session and per-source caches', () => {
    setSessionSettingsCache({
      settings: {
        model: 'sonnet',
      } as never,
      errors: [],
    })
    setCachedSettingsForSource('userSettings', {
      model: 'sonnet',
    } as never)

    expect(getSessionSettingsCache()?.settings).toEqual({
      model: 'sonnet',
    })
    expect(getCachedSettingsForSource('userSettings')).toEqual({
      model: 'sonnet',
    })

    resetSettingsCache()

    expect(getSessionSettingsCache()).toBeNull()
    expect(getCachedSettingsForSource('userSettings')).toBeUndefined()
  })

  it('tracks plugin settings base independently', () => {
    setPluginSettingsBase({ source: 'plugin' })
    expect(getPluginSettingsBase()).toEqual({ source: 'plugin' })

    clearPluginSettingsBase()
    expect(getPluginSettingsBase()).toBeUndefined()
  })
})
