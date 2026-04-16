import { describe, expect, it } from 'bun:test'
import {
  getFirstWordPrefix,
  getSimpleCommandPrefix,
  matchWildcardPattern,
  permissionRuleExtractPrefix,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
  stripWrappersFromArgv,
} from 'src/tools/BashTool/bashPermissions.js'

describe('bashPermissions', () => {
  it('extracts stable command prefixes only from safe leading env vars', () => {
    expect(getSimpleCommandPrefix('NODE_ENV=prod npm run build')).toBe(
      'npm run',
    )
    expect(getSimpleCommandPrefix('MY_VAR=prod npm run build')).toBeNull()
    expect(getSimpleCommandPrefix('git commit -m "fix"')).toBe('git commit')
  })

  it('extracts first-word prefixes while blocking shell wrappers', () => {
    expect(getFirstWordPrefix('git status')).toBe('git')
    expect(getFirstWordPrefix('NODE_ENV=test pytest -q')).toBe('pytest')
    expect(getFirstWordPrefix('bash -lc "echo hi"')).toBeNull()
    expect(getFirstWordPrefix('env python app.py')).toBeNull()
  })

  it('strips safe wrappers and leading comment lines before permission matching', () => {
    expect(
      stripSafeWrappers('# explain command\nNODE_ENV=prod timeout --signal=TERM 5 git status'),
    ).toBe('git status')
    expect(stripSafeWrappers('nohup -- nice -n 5 rg needle .')).toBe(
      'rg needle .',
    )
  })

  it('handles permission-rule prefix helpers', () => {
    expect(permissionRuleExtractPrefix('npm run:*')).toBe('npm run')
    expect(matchWildcardPattern('npm run*', 'npm run build')).toBe(true)
    expect(matchWildcardPattern('npm run:*', 'npm test')).toBe(false)
  })

  it('strips leading env vars for deny-rule matching', () => {
    expect(stripAllLeadingEnvVars("FOO=bar BAR='baz qux' git status")).toBe(
      'git status',
    )
  })

  it('strips wrapper argv when shell rules are checked structurally', () => {
    expect(
      stripWrappersFromArgv([
        'timeout',
        '--signal',
        'TERM',
        '5',
        'git',
        'status',
      ]),
    ).toEqual(['git', 'status'])
    expect(stripWrappersFromArgv(['nice', '-n', '10', 'rm', 'file.txt'])).toEqual(
      ['rm', 'file.txt'],
    )
  })
})
