import { describe, expect, it } from 'bun:test'
import {
  importFreshSourceModule,
  mockSourceModule,
  patchEnv,
} from '../support/index.js'

type StartupSideEffectsModule =
  typeof import('../../src/entrypoints/startupSideEffects.ts')

function envTruthy(value: string | boolean | undefined): boolean {
  if (!value) return false
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim())
}

async function loadStartupSideEffectsModule(options?: { bare?: boolean }) {
  const calls = {
    keychain: 0,
    mdm: 0,
  }

  mockSourceModule('src/utils/envUtils.ts', () => ({
    isBareMode: () => options?.bare ?? false,
    isEnvTruthy: envTruthy,
  }))
  mockSourceModule('src/utils/secureStorage/keychainPrefetch.ts', () => ({
    startKeychainPrefetch: () => {
      calls.keychain += 1
    },
  }))
  mockSourceModule('src/utils/settings/mdm/rawRead.ts', () => ({
    startMdmRawRead: () => {
      calls.mdm += 1
    },
  }))

  const module = await importFreshSourceModule<StartupSideEffectsModule>(
    'src/entrypoints/startupSideEffects.ts',
  )

  return { calls, module }
}

describe('startupSideEffects', () => {
  it('starts MDM and keychain warmups once for the normal CLI path', async () => {
    const { calls, module } = await loadStartupSideEffectsModule()

    expect(module.shouldStartStartupSideEffects()).toBe(true)

    module.startStartupSideEffects()
    module.startStartupSideEffects()

    expect(calls).toEqual({
      keychain: 1,
      mdm: 1,
    })
  })

  it('skips startup warmups in bare mode', async () => {
    const { calls, module } = await loadStartupSideEffectsModule({
      bare: true,
    })

    expect(module.shouldStartStartupSideEffects()).toBe(false)

    module.startStartupSideEffects()

    expect(calls).toEqual({
      keychain: 0,
      mdm: 0,
    })
  })

  it('skips startup warmups when startup side effects are explicitly disabled', async () => {
    const restoreEnv = patchEnv({
      CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS: '1',
    })

    try {
      const { calls, module } = await loadStartupSideEffectsModule()

      expect(module.shouldStartStartupSideEffects()).toBe(false)

      module.startStartupSideEffects()

      expect(calls).toEqual({
        keychain: 0,
        mdm: 0,
      })
    } finally {
      restoreEnv()
    }
  })
})
