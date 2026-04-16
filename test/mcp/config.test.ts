import { describe, expect, it } from 'bun:test'
import {
  dedupPluginMcpServers,
  getMcpServerSignature,
  parseMcpConfig,
  parseMcpConfigFromFilePath,
  unwrapCcrProxyUrl,
} from 'src/services/mcp/config.js'
import { expandEnvVarsInString } from 'src/services/mcp/envExpansion.js'
import {
  createTempWorkspace,
  patchEnv,
  writeJsonFile,
  writeTextFile,
} from '../support/index.js'

describe('mcp config helpers', () => {
  it('expands environment variables with defaults', () => {
    const restoreEnv = patchEnv({ MCP_TOKEN: 'token-123' })

    try {
      expect(
        expandEnvVarsInString('${MCP_TOKEN}:${MISSING:-fallback}'),
      ).toEqual({
        expanded: 'token-123:fallback',
        missingVars: [],
      })
    } finally {
      restoreEnv()
    }
  })

  it('unwraps CCR proxy URLs while leaving plain URLs unchanged', () => {
    const vendorUrl = 'https://mcp.slack.com/connector'
    const proxyUrl = `https://ccr.example.com/v2/session_ingress/shttp/mcp/slack?mcp_url=${encodeURIComponent(vendorUrl)}`

    expect(unwrapCcrProxyUrl(proxyUrl)).toBe(vendorUrl)
    expect(unwrapCcrProxyUrl(vendorUrl)).toBe(vendorUrl)
  })

  it('computes stable server signatures for stdio and remote servers', () => {
    expect(
      getMcpServerSignature({
        command: 'npx',
        args: ['@scope/server'],
      }),
    ).toBe('stdio:["npx","@scope/server"]')

    expect(
      getMcpServerSignature({
        type: 'http',
        url: 'https://proxy.example.com/v2/session_ingress/shttp/mcp/slack?mcp_url=https%3A%2F%2Fmcp.slack.com%2Fconnector',
      }),
    ).toBe('url:https://mcp.slack.com/connector')
  })

  it('deduplicates plugin servers against manual and earlier plugin entries', () => {
    const manualServers = {
      slack: {
        scope: 'user',
        type: 'http',
        url: 'https://mcp.slack.com/connector',
      },
    }
    const pluginServers = {
      'plugin-a:slack': {
        scope: 'user',
        type: 'http',
        url: 'https://mcp.slack.com/connector',
      },
      'plugin-a:notes': {
        scope: 'user',
        command: 'npx',
        args: ['notes-server'],
      },
      'plugin-b:notes': {
        scope: 'user',
        command: 'npx',
        args: ['notes-server'],
      },
    }

    const result = dedupPluginMcpServers(pluginServers, manualServers)

    expect(Object.keys(result.servers)).toEqual(['plugin-a:notes'])
    expect(result.suppressed).toEqual([
      { name: 'plugin-a:slack', duplicateOf: 'slack' },
      { name: 'plugin-b:notes', duplicateOf: 'plugin-a:notes' },
    ])
  })

  it('parses config objects, expands env vars, and warns on missing vars', () => {
    const restoreEnv = patchEnv({ MCP_TOKEN: 'token-123' })

    try {
      const result = parseMcpConfig({
        configObject: {
          mcpServers: {
            example: {
              command: 'npx',
              args: [
                'tool',
                '--token',
                '${MCP_TOKEN}',
                '--fallback',
                '${OPTIONAL:-fallback}',
                '--missing',
                '${MISSING_TOKEN}',
              ],
              env: {
                AUTH_TOKEN: '${MCP_TOKEN}',
              },
            },
          },
        },
        expandVars: true,
        scope: 'user',
      })

      expect(result.config?.mcpServers.example).toEqual({
        command: 'npx',
        args: [
          'tool',
          '--token',
          'token-123',
          '--fallback',
          'fallback',
          '--missing',
          '${MISSING_TOKEN}',
        ],
        env: {
          AUTH_TOKEN: 'token-123',
        },
      })
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.message).toContain('MISSING_TOKEN')
    } finally {
      restoreEnv()
    }
  })

  it('parses config files and reports invalid JSON clearly', async () => {
    const workspace = await createTempWorkspace()
    const validPath = `${workspace}/valid.mcp.json`
    const invalidPath = `${workspace}/broken.mcp.json`

    await writeJsonFile(validPath, {
      mcpServers: {
        example: {
          command: 'npx',
          args: ['tool'],
        },
      },
    })
    await writeTextFile(invalidPath, '{ invalid json')

    const valid = parseMcpConfigFromFilePath({
      filePath: validPath,
      expandVars: false,
      scope: 'project',
    })
    const invalid = parseMcpConfigFromFilePath({
      filePath: invalidPath,
      expandVars: false,
      scope: 'project',
    })

    expect(valid.config?.mcpServers.example).toEqual({
      command: 'npx',
      args: ['tool'],
    })
    expect(invalid.config).toBeNull()
    expect(invalid.errors[0]?.message).toBe('MCP config is not a valid JSON')
  })
})
