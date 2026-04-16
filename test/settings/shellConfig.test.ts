import { describe, expect, it } from 'bun:test'
import {
  filterClaudeAliases,
  findValidClaudeAlias,
  getShellConfigPaths,
  readFileLines,
} from 'src/utils/shellConfig.js'
import { createTempWorkspace, patchEnv, writeTextFile } from '../support/index.js'

describe('shellConfig utilities', () => {
  it('derives shell config locations and respects ZDOTDIR', () => {
    const paths = getShellConfigPaths({
      homedir: '/Users/tester',
      env: {
        ZDOTDIR: '/tmp/zdotdir',
      },
    })

    expect(paths).toEqual({
      zsh: '/tmp/zdotdir/.zshrc',
      bash: '/Users/tester/.bashrc',
      fish: '/Users/tester/.config/fish/config.fish',
    })
  })

  it('removes only the installer-managed klaudia alias', async () => {
    const workspace = await createTempWorkspace()
    const restoreEnv = patchEnv({
      KLAUDIA_CONFIG_DIR: `${workspace}/.klaudia`,
    })

    try {
      const lines = [
        `alias klaudia='${workspace}/.klaudia/local/klaudia'`,
        "alias klaudia='/usr/local/bin/klaudia-custom'",
        'export PATH="$PATH:$HOME/bin"',
      ]

      const result = filterClaudeAliases(lines)

      expect(result.hadAlias).toBe(true)
      expect(result.filtered).toEqual([
        "alias klaudia='/usr/local/bin/klaudia-custom'",
        'export PATH="$PATH:$HOME/bin"',
      ])
    } finally {
      restoreEnv()
    }
  })

  it('finds aliases that point at existing executables', async () => {
    const home = await createTempWorkspace()
    const aliasPath = `${home}/bin/klaudia`
    const zshrcPath = `${home}/.zshrc`

    await writeTextFile(aliasPath, '#!/bin/sh\nexit 0\n')
    await writeTextFile(zshrcPath, "alias klaudia='~/bin/klaudia'\n")

    expect(
      await findValidClaudeAlias({
        homedir: home,
        env: {},
      }),
    ).toBe('~/bin/klaudia')
    expect(await readFileLines(`${home}/missing.rc`)).toBeNull()
  })
})
