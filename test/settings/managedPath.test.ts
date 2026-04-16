import { describe, expect, it } from 'bun:test'
import {
  importFreshSourceModule,
  patchEnv,
  registerTestCleanup,
} from '../support/index.js'

type ManagedPathModule = typeof import('../../src/utils/settings/managedPath.ts')

async function loadManagedPathModule() {
  return importFreshSourceModule<ManagedPathModule>(
    'src/utils/settings/managedPath.ts',
  )
}

async function withPlatform(platform: 'macos' | 'windows' | 'linux') {
  const module = await loadManagedPathModule()
  module.setManagedPathPlatformForTesting(platform)
  registerTestCleanup(() => {
    module.setManagedPathPlatformForTesting(null)
  })
  return module
}
describe('managedPath', () => {
  it('returns the macOS managed settings location', async () => {
    const macos = await withPlatform('macos')
    expect(macos.getManagedFilePath()).toBe(
      '/Library/Application Support/KlaudiaCode',
    )
    expect(macos.getManagedSettingsDropInDir()).toBe(
      '/Library/Application Support/KlaudiaCode/managed-settings.d',
    )
  })

  it('returns the Windows managed settings location', async () => {
    const windows = await withPlatform('windows')
    expect(windows.getManagedFilePath()).toBe('C:\\Program Files\\KlaudiaCode')
    expect(windows.getManagedSettingsDropInDir()).toBe(
      'C:\\Program Files\\KlaudiaCode/managed-settings.d',
    )
  })

  it('returns the Linux managed settings location', async () => {
    const linux = await withPlatform('linux')
    expect(linux.getManagedFilePath()).toBe('/etc/klaudia-code')
    expect(linux.getManagedSettingsDropInDir()).toBe(
      '/etc/klaudia-code/managed-settings.d',
    )
  })

  it('honors the ant-only managed settings path override', async () => {
    const restoreEnv = patchEnv({
      USER_TYPE: 'ant',
      KLAUDIA_CODE_MANAGED_SETTINGS_PATH: '/tmp/managed-override',
    })

    try {
      const module = await withPlatform('macos')
      expect(module.getManagedFilePath()).toBe('/tmp/managed-override')
      expect(module.getManagedSettingsDropInDir()).toBe(
        '/tmp/managed-override/managed-settings.d',
      )
    } finally {
      restoreEnv()
    }
  })
})
