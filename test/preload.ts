import { afterEach, beforeEach } from 'bun:test'
import {
  applyHarnessDefaults,
  markPreloadApplied,
  resetSharedTestState,
} from './support/state.js'

markPreloadApplied()

beforeEach(() => {
  applyHarnessDefaults()
})

afterEach(async () => {
  await resetSharedTestState()
})
