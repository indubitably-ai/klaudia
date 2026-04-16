import { mock } from 'bun:test'
import { cleanupTempWorkspaces } from './fs.js'
import { sourceModuleHref } from './modulePaths.js'
import {
  applyHarnessDefaults as applyHarnessDefaultsToEnv,
  resetEnv,
} from './env.js'
import { restoreTime } from './time.js'

const PRELOAD_SENTINEL = Symbol.for('klaudia.test.preload')
const testCleanups: Array<() => void | Promise<void>> = []

export function markPreloadApplied(): void {
  globalThis[PRELOAD_SENTINEL] = true
}

export function preloadWasApplied(): boolean {
  return globalThis[PRELOAD_SENTINEL] === true
}

export function registerTestCleanup(
  cleanup: () => void | Promise<void>,
): void {
  testCleanups.push(cleanup)
}

export function applyHarnessDefaults(): void {
  applyHarnessDefaultsToEnv()
}

async function maybeImportModule<T>(
  sourcePath: string,
): Promise<T | null> {
  try {
    return (await import(sourceModuleHref(sourcePath))) as T
  } catch {
    return null
  }
}

async function runRegisteredCleanups(): Promise<void> {
  while (testCleanups.length > 0) {
    const cleanup = testCleanups.pop()
    await cleanup?.()
  }
}

export async function flushMicrotasks(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

export async function resetSharedTestState(): Promise<void> {
  await runRegisteredCleanups()

  mock.clearAllMocks()
  mock.restore()

  const analytics = await maybeImportModule<{
    _resetForTesting?: () => void
  }>('src/services/analytics/index.ts')
  analytics?._resetForTesting?.()

  const settingsCache = await maybeImportModule<{
    resetSettingsCache?: () => void
    clearPluginSettingsBase?: () => void
  }>('src/utils/settings/settingsCache.ts')
  settingsCache?.resetSettingsCache?.()
  settingsCache?.clearPluginSettingsBase?.()

  const internalWrites = await maybeImportModule<{
    clearInternalWrites?: () => void
  }>('src/utils/settings/internalWrites.ts')
  internalWrites?.clearInternalWrites?.()

  const changeDetector = await maybeImportModule<{
    resetForTesting?: () => Promise<void>
  }>('src/utils/settings/changeDetector.ts')
  await changeDetector?.resetForTesting?.()
  restoreTime()
  resetEnv()
  await cleanupTempWorkspaces()
}
