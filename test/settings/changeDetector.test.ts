import { describe, expect, it, mock, vi } from 'bun:test'
import { join } from 'path'
import { markInternalWrite } from 'src/utils/settings/internalWrites.js'
import {
  createTempWorkspace,
  ensureDir,
  flushMicrotasks,
  importFreshSourceModule,
  mockSourceModule,
  registerTestCleanup,
  useFakeTime,
} from '../support/index.js'

type ChangeDetectorModule = typeof import('../../src/utils/settings/changeDetector.ts')

async function setupChangeDetectorHarness() {
  const workspace = await createTempWorkspace()
  const managedDropInDir = await ensureDir(
    `${workspace}/managed/managed-settings.d`,
  )
  const realBootstrapState =
    await importFreshSourceModule<typeof import('../../src/bootstrap/state.ts')>(
      'src/bootstrap/state.ts',
    )
  const paths = {
    userSettings: `${workspace}/user/settings.json`,
    projectSettings: `${workspace}/project/.klaudia/settings.json`,
    localSettings: `${workspace}/project/.klaudia/settings.local.json`,
    policySettings: `${workspace}/managed/managed-settings.json`,
  }

  await Promise.all([
    ensureDir(join(workspace, 'user')),
    ensureDir(join(workspace, 'project/.klaudia')),
    ensureDir(join(workspace, 'managed')),
  ])
  await Promise.all(
    Object.values(paths).map(async filePath => {
      await Bun.write(filePath, '{}\n')
    }),
  )

  const resetCalls: string[] = []
  const watcherHandlers = new Map<string, (path: string) => void>()
  const watcher = {
    on(event: string, handler: (path: string) => void) {
      watcherHandlers.set(event, handler)
      return this
    },
    async close() {},
  }
  const watchCalls: Array<{ dirs: string[]; options: Record<string, unknown> }> =
    []

  mock.module('chokidar', () => ({
    default: {
      watch: (dirs: string[], options: Record<string, unknown>) => {
        watchCalls.push({ dirs, options })
        return watcher
      },
    },
  }))

  mockSourceModule('src/bootstrap/state.ts', () => ({
    ...realBootstrapState,
    addSlowOperation: () => () => {},
    getAllowedSettingSources: () =>
      ['userSettings', 'projectSettings', 'localSettings'] as const,
    getIsRemoteMode: () => false,
    getOriginalCwd: () => workspace,
    isReplBridgeActive: () => false,
  }))
  mockSourceModule('src/utils/cleanupRegistry.ts', () => ({
    registerCleanup: () => {},
  }))
  mockSourceModule('src/utils/hooks.ts', () => ({
    executeConfigChangeHooks: async () => [],
    hasBlockingResult: () => false,
  }))
  mockSourceModule('src/utils/settings/managedPath.ts', () => ({
    getManagedSettingsDropInDir: () => managedDropInDir,
  }))
  mockSourceModule('src/utils/settings/mdm/settings.ts', () => ({
    getHkcuSettings: () => ({ settings: {} }),
    getMdmSettings: () => ({ settings: {} }),
    refreshMdmSettings: async () => ({
      mdm: { settings: {} },
      hkcu: { settings: {} },
    }),
    setMdmSettingsCache: () => {},
  }))
  mockSourceModule('src/utils/settings/settings.ts', () => ({
    getSettingsFilePathForSource: (source: keyof typeof paths) =>
      paths[source] ?? null,
  }))
  mockSourceModule('src/utils/settings/settingsCache.ts', () => ({
    resetSettingsCache: () => {
      resetCalls.push('reset')
    },
  }))

  const changeDetector = await importFreshSourceModule<ChangeDetectorModule>(
    'src/utils/settings/changeDetector.ts',
  )
  await changeDetector.resetForTesting({
    stabilityThreshold: 1,
    pollInterval: 1,
    mdmPollInterval: 50,
    deletionGrace: 5,
  })
  registerTestCleanup(() => changeDetector.resetForTesting())

  return {
    changeDetector,
    managedDropInDir,
    paths,
    resetCalls,
    watchCalls,
    watcherHandlers,
  }
}

describe('changeDetector', () => {
  it('watches settings directories plus managed drop-ins', async () => {
    const harness = await setupChangeDetectorHarness()

    await harness.changeDetector.initialize()

    expect(harness.watchCalls).toHaveLength(1)
    expect([...harness.watchCalls[0]!.dirs].sort()).toEqual(
      [
        join(harness.paths.userSettings, '..'),
        join(harness.paths.projectSettings, '..'),
        join(harness.paths.policySettings, '..'),
        harness.managedDropInDir,
      ].sort(),
    )
  })

  it('suppresses watcher notifications for internal writes', async () => {
    const harness = await setupChangeDetectorHarness()
    const notifications: string[] = []

    await harness.changeDetector.initialize()
    const unsubscribe = harness.changeDetector.subscribe(source => {
      notifications.push(source)
    })
    registerTestCleanup(unsubscribe)

    markInternalWrite(harness.paths.userSettings)
    harness.watcherHandlers.get('change')?.(harness.paths.userSettings)
    await flushMicrotasks()

    expect(notifications).toEqual([])
    expect(harness.resetCalls).toEqual([])
  })

  it('emits after the deletion grace window when a file stays deleted', async () => {
    const harness = await setupChangeDetectorHarness()
    const notifications: string[] = []

    await harness.changeDetector.initialize()
    const unsubscribe = harness.changeDetector.subscribe(source => {
      notifications.push(source)
    })
    registerTestCleanup(unsubscribe)

    useFakeTime('2026-04-03T12:00:00.000Z')
    harness.watcherHandlers.get('unlink')?.(harness.paths.projectSettings)
    expect(notifications).toEqual([])

    vi.advanceTimersByTime(6)
    await flushMicrotasks()

    expect(notifications).toEqual(['projectSettings'])
    expect(harness.resetCalls).toEqual(['reset'])
  })

  it('maps managed drop-in additions to policySettings changes', async () => {
    const harness = await setupChangeDetectorHarness()
    const notifications: string[] = []

    await harness.changeDetector.initialize()
    const unsubscribe = harness.changeDetector.subscribe(source => {
      notifications.push(source)
    })
    registerTestCleanup(unsubscribe)

    const dropInFile = `${harness.managedDropInDir}/10-security.json`
    await Bun.write(dropInFile, '{}\n')

    harness.watcherHandlers.get('add')?.(dropInFile)
    await flushMicrotasks()

    expect(notifications).toEqual(['policySettings'])
    expect(harness.resetCalls).toEqual(['reset'])
  })
})
