import { isBareMode, isEnvTruthy } from '../utils/envUtils.js'
import { startKeychainPrefetch } from '../utils/secureStorage/keychainPrefetch.js'
import { startMdmRawRead } from '../utils/settings/mdm/rawRead.js'
import { recordStartupTraceEvent } from './startupTrace.js'

let startupSideEffectsStarted = false

export function shouldStartStartupSideEffects(): boolean {
  return (
    !isBareMode() &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS)
  )
}

/**
 * Start OS-level startup reads that warm caches for the full CLI path.
 * Safe callers can skip this entirely via --bare or
 * CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS=1.
 */
export function startStartupSideEffects(): void {
  if (startupSideEffectsStarted || !shouldStartStartupSideEffects()) {
    return
  }

  startupSideEffectsStarted = true
  recordStartupTraceEvent('startup.bootstrap_started')
  startMdmRawRead()
  startKeychainPrefetch()
}

export function resetStartupSideEffectsForTesting(): void {
  startupSideEffectsStarted = false
}
