import { describe, expect, it } from 'bun:test'
import { runCliCommand } from '../support/index.js'

const SMOKE_CASES = [
  {
    name: '--version',
    args: ['--version'],
    output: /\(Klaudia\)/,
  },
  {
    name: '--help',
    args: ['--help'],
    output: /Usage:/,
  },
  {
    name: '--bare --help',
    args: ['--bare', '--help'],
    output: /Usage:/,
  },
  {
    name: 'mcp --help',
    args: ['mcp', '--help'],
    output: /Usage:/,
  },
  {
    name: 'plugin --help',
    args: ['plugin', '--help'],
    output: /Usage:/,
  },
  {
    name: 'doctor --help',
    args: ['doctor', '--help'],
    output: /Usage:/,
  },
  {
    name: 'update --help',
    args: ['update', '--help'],
    output: /Usage:/,
  },
] as const

describe('runtime safe boot matrix', () => {
  for (const smokeCase of SMOKE_CASES) {
    it(`boots ${smokeCase.name} in a disposable safe-mode environment`, async () => {
      const result = await runCliCommand([...smokeCase.args])

      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toMatch(smokeCase.output)
      expect(result.traceEvents).toEqual([])
    })
  }
})
