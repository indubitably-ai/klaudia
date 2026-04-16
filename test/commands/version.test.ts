import { describe, expect, it } from 'bun:test'
import { patchEnv, resetEnv } from '../support/index.js'
import versionCommand from 'src/commands/version.ts'

describe('command/version', () => {
  it('returns version text when enabled', async () => {
    const restoreEnv = patchEnv({ USER_TYPE: 'ant' })
    try {
      const module = await versionCommand.load()
      const result = await module.call('', {} as never)
      expect(result.type).toBe('text')
      expect(result.value.length).toBeGreaterThan(0)
    } finally {
      restoreEnv()
      resetEnv()
    }
  })
})
