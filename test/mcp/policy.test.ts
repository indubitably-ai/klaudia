import { describe, expect, it } from 'bun:test'
import { importFreshSourceModule, mockSourceModule } from '../support/index.js'

async function loadConfigModuleWithSettings(settings: {
  initial?: Record<string, unknown>
  policy?: Record<string, unknown>
}) {
  mockSourceModule('src/utils/settings/settings.ts', () => ({
    getInitialSettings: () => settings.initial ?? {},
    getSettingsForSource: (source: string) =>
      source === 'policySettings' ? settings.policy ?? {} : {},
  }))

  return importFreshSourceModule<typeof import('../../src/services/mcp/config.ts')>(
    'src/services/mcp/config.ts',
  )
}

describe('mcp policy filtering', () => {
  it('filters stdio servers against allowlists while keeping sdk entries', async () => {
    const config = await loadConfigModuleWithSettings({
      initial: {
        allowedMcpServers: [{ serverCommand: ['npx', 'allowed-server'] }],
      },
    })

    const result = config.filterMcpServersByPolicy({
      allowed: {
        command: 'npx',
        args: ['allowed-server'],
      },
      blocked: {
        command: 'npx',
        args: ['blocked-server'],
      },
      sdk: {
        type: 'sdk',
        name: 'claude-vscode',
      },
    })

    expect(Object.keys(result.allowed)).toEqual(['allowed', 'sdk'])
    expect(result.blocked).toEqual(['blocked'])
  })

  it('lets deny rules override allow rules for remote servers', async () => {
    const config = await loadConfigModuleWithSettings({
      initial: {
        allowedMcpServers: [{ serverUrl: 'https://*.example.com/*' }],
        deniedMcpServers: [{ serverUrl: 'https://blocked.example.com/*' }],
      },
    })

    const result = config.filterMcpServersByPolicy({
      ok: {
        type: 'http',
        url: 'https://ok.example.com/connector',
      },
      blocked: {
        type: 'http',
        url: 'https://blocked.example.com/connector',
      },
    })

    expect(Object.keys(result.allowed)).toEqual(['ok'])
    expect(result.blocked).toEqual(['blocked'])
  })
})
