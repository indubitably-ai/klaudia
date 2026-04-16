import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_SMALL_MODEL,
  getProviderRegistry,
  getUnsupportedLegacyProviderEnv,
  mapAppModelToProviderModel,
} from 'src/provider/providerRegistry.js'

describe('providerRegistry', () => {
  it('builds an OpenAI-first provider registry with Codex defaults', () => {
    const registry = getProviderRegistry({})

    expect(registry.activeProviderId).toBe('openai')
    expect(registry.providers.openai).toEqual({
      id: 'openai',
      compatibilityProvider: 'firstParty',
      name: 'OpenAI / Codex',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      headers: {},
      retry: {
        maxAttempts: 4,
        baseDelayMs: 200,
        retry429: false,
        retry5xx: true,
        retryTransport: true,
      },
      streamIdleTimeoutMs: 300_000,
      requiresOpenAIAuth: true,
      supportsWebsockets: true,
      modelCatalog: {
        defaultModel: DEFAULT_OPENAI_MODEL,
        smallModel: DEFAULT_OPENAI_SMALL_MODEL,
      },
    })
  })

  it('flags unsupported Anthropic and cloud-provider env vars', () => {
    expect(
      getUnsupportedLegacyProviderEnv({
        ANTHROPIC_API_KEY: 'sk-ant',
        CLAUDE_CODE_USE_VERTEX: '1',
        OPENAI_BASE_URL: 'http://localhost:3000',
      }),
    ).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_VERTEX'])
  })

  it('maps existing app model names onto the OpenAI catalog', () => {
    expect(mapAppModelToProviderModel('claude-sonnet-4-6')).toBe(
      DEFAULT_OPENAI_MODEL,
    )
    expect(mapAppModelToProviderModel('claude-haiku-4-5')).toBe(
      DEFAULT_OPENAI_SMALL_MODEL,
    )
    expect(mapAppModelToProviderModel('gpt-5.2-codex')).toBe(
      'gpt-5.2-codex',
    )
  })
})
