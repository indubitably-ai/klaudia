import { describe, expect, it } from 'bun:test'
import {
  extractSedExpressions,
  hasFileArgs,
  isLinePrintingCommand,
  isPrintCommand,
  sedCommandIsAllowedByAllowlist,
} from 'src/tools/BashTool/sedValidation.js'

describe('sedValidation', () => {
  it('accepts only the strict print command allowlist', () => {
    const accepted = ['p', '1p', '10,200p']
    const rejected = ['1q', 's/foo/bar/', 'w file.txt', '']

    for (const command of accepted) {
      expect(isPrintCommand(command)).toBe(true)
    }

    for (const command of rejected) {
      expect(isPrintCommand(command)).toBe(false)
    }
  })

  it('recognizes line-printing commands with safe flags only', () => {
    const command = "sed -nE '1p;2,4p' file.txt"
    const expressions = extractSedExpressions(command)

    expect(isLinePrintingCommand(command, expressions)).toBe(true)
    expect(
      isLinePrintingCommand("sed -E '1p' file.txt", ['1p']),
    ).toBe(false)
    expect(
      isLinePrintingCommand("sed -n '1p;q' file.txt", ['1p;q']),
    ).toBe(false)
  })

  it('allows stdout-only substitutions and rejects file writes by default', () => {
    expect(sedCommandIsAllowedByAllowlist("sed 's/foo/bar/g'")).toBe(true)
    expect(
      sedCommandIsAllowedByAllowlist("sed 's/foo/bar/g' README.md"),
    ).toBe(false)
    expect(
      sedCommandIsAllowedByAllowlist("sed -i 's/foo/bar/g' README.md"),
    ).toBe(false)
  })

  it('allows in-place substitutions only when file writes are explicitly enabled', () => {
    expect(
      sedCommandIsAllowedByAllowlist("sed -i 's/foo/bar/g' README.md", {
        allowFileWrites: true,
      }),
    ).toBe(true)
    expect(
      sedCommandIsAllowedByAllowlist("sed -i -e 's/foo/bar/e' README.md", {
        allowFileWrites: true,
      }),
    ).toBe(false)
  })

  it('extracts expressions and file-argument detection correctly', () => {
    expect(extractSedExpressions("sed -e '1p' -e '2p' file.txt")).toEqual([
      '1p',
      '2p',
    ])
    expect(hasFileArgs("sed 's/foo/bar/'")).toBe(false)
    expect(hasFileArgs("sed -i 's/foo/bar/' file.txt")).toBe(true)
  })
})
