import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { describe, expect, it } from 'bun:test'
import { SKILL_FILES, SKILL_MD } from 'src/skills/bundled/verifyContent.js'
import {
  getRuntimeBuildTime,
  getRuntimeVersion,
} from 'src/utils/runtimeVersion.js'

const SAFE_RUNTIME_FILES = [
  'src/entrypoints/cli.tsx',
  'src/main.tsx',
  'src/commands/version.ts',
]

describe('runtime completeness', () => {
  it('loads bundled verify skill assets required by the safe boot path', () => {
    expect(SKILL_MD.trim().length).toBeGreaterThan(0)
    expect(Object.keys(SKILL_FILES).sort()).toEqual([
      'examples/cli.md',
      'examples/server.md',
    ])

    for (const content of Object.values(SKILL_FILES)) {
      expect(content.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps safe runtime metadata behind the runtimeVersion shim', async () => {
    expect(getRuntimeVersion()).toBe('unknown')
    expect(getRuntimeBuildTime()).toBeUndefined()

    for (const relativePath of SAFE_RUNTIME_FILES) {
      const content = await readFile(resolve(process.cwd(), relativePath), 'utf8')
      expect(content.includes('MACRO.')).toBe(false)
    }
  })
})
