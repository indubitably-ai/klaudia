import { describe, expect, it } from 'bun:test'
import { runCliCommand } from '../support/index.js'

describe('runtime startup side effects integration', () => {
  it('does not invoke startup warmups for --bare --help in safe mode', async () => {
    const result = await runCliCommand(['--bare', '--help'])

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.traceEvents).toEqual([])
  })

  it('records startup bootstrap attempts when safe mode is not enabled', async () => {
    const result = await runCliCommand(['--help'], {
      safeMode: false,
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(
      result.traceEvents.some(event => event.type === 'startup.bootstrap_started'),
    ).toBe(true)

    if (process.platform === 'darwin') {
      expect(
        result.traceEvents.some(
          event =>
            event.type === 'startup.keychain.spawn' &&
            event.command === 'security',
        ),
      ).toBe(true)
    }

    if (process.platform === 'win32') {
      expect(
        result.traceEvents.some(
          event =>
            event.type === 'startup.mdm.spawn' && event.command === 'reg',
        ),
      ).toBe(true)
    }
  })
})
