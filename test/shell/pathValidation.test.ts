import { describe, expect, it } from 'bun:test'
import {
  PATH_EXTRACTORS,
  stripWrappersFromArgv,
} from 'src/tools/BashTool/pathValidation.js'

describe('pathValidation', () => {
  it('preserves paths that appear after the POSIX double-dash delimiter', () => {
    expect(
      PATH_EXTRACTORS.rm(['--', '-/../.klaudia/settings.local.json']),
    ).toEqual(['-/../.klaudia/settings.local.json'])
  })

  it('uses sensible defaults for grep and ripgrep path extraction', () => {
    expect(PATH_EXTRACTORS.grep(['-r', 'needle'])).toEqual(['.'])
    expect(PATH_EXTRACTORS.rg(['needle'])).toEqual(['.'])
  })

  it('extracts path-like arguments for find and sed safely', () => {
    expect(PATH_EXTRACTORS.find(['.', '-name', '*.ts'])).toEqual(['.'])
    expect(PATH_EXTRACTORS.sed(['-f', 'script.sed', '--', 'file.txt'])).toEqual(
      ['script.sed', 'file.txt'],
    )
  })

  it('strips argv wrappers used by the path validator', () => {
    expect(
      stripWrappersFromArgv(['env', '-i', 'FOO=bar', 'git', 'status']),
    ).toEqual(['git', 'status'])
    expect(
      stripWrappersFromArgv(['stdbuf', '-o0', '-eL', 'rg', 'needle', '.']),
    ).toEqual(['rg', 'needle', '.'])
  })
})
