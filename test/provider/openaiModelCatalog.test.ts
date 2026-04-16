import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchOpenAIModelCatalog,
  getDefaultOpenAIModel,
  getFallbackOpenAIModelCatalogSnapshot,
  getVisibleOpenAIModelCatalogEntries,
  isKnownOpenAIModel,
  refreshOpenAIModelCatalog,
  type OpenAIModelCatalogSnapshot,
} from 'src/provider/openaiModelCatalog.js'
import { DEFAULT_GLOBAL_CONFIG, saveGlobalConfig } from 'src/utils/config.js'

const AUTH = {
  authMode: 'chatgpt',
  authSource: 'browser',
  storageMode: 'file',
  tokens: {
    idToken: 'id-token',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accountId: 'acct_123',
  },
  account: {
    email: 'user@example.com',
    plan: 'pro',
    userId: 'user_123',
    accountId: 'acct_123',
  },
  lastRefresh: '2026-04-04T12:00:00.000Z',
} as const

const FIXTURE_MODELS_RESPONSE = {
  models: [
    {
      slug: 'gpt-5.4',
      display_name: 'gpt-5.4',
      description: 'Most capable general model',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 1,
    },
    {
      slug: 'gpt-5.4-mini',
      display_name: 'gpt-5.4-mini',
      description: 'Fastest GPT-5.4 variant',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 3,
    },
    {
      slug: 'gpt-hidden',
      display_name: 'Hidden',
      description: 'Hidden from picker',
      default_reasoning_level: null,
      supported_reasoning_levels: [],
      visibility: 'hide',
      supported_in_api: true,
      priority: 30,
    },
    {
      slug: 'gpt-unsupported',
      display_name: 'Unsupported',
      description: 'Not supported in API',
      default_reasoning_level: null,
      supported_reasoning_levels: [],
      visibility: 'list',
      supported_in_api: false,
      priority: 4,
    },
  ],
}

function resetGlobalConfig(): void {
  saveGlobalConfig(() => ({ ...DEFAULT_GLOBAL_CONFIG }))
}

describe('openai model catalog', () => {
  afterEach(() => {
    resetGlobalConfig()
  })

  it('fetches and normalizes the /models response with auth and etag', async () => {
    let capturedUrl: string | null = null
    let capturedInit: RequestInit | undefined

    const result = await fetchOpenAIModelCatalog({
      auth: AUTH,
      env: {
        OPENAI_BASE_URL: 'https://codex.example.test',
        OPENAI_ORGANIZATION: 'org_123',
        OPENAI_PROJECT: 'proj_456',
      },
      fetchImpl: async (input, init) => {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(JSON.stringify(FIXTURE_MODELS_RESPONSE), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"models-123"',
          },
        })
      },
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      throw new Error('expected ok models response')
    }

    expect(capturedUrl).toContain('/models?client_version=')
    expect(capturedUrl).not.toContain('source')
    expect(capturedInit?.method).toBe('GET')
    expect(capturedInit?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'ChatGPT-Account-ID': 'acct_123',
      Accept: 'application/json',
      'OpenAI-Organization': 'org_123',
      'OpenAI-Project': 'proj_456',
    })
    expect((capturedInit?.headers as Record<string, string>)['X-Client-Request-Id']).toEqual(
      expect.any(String),
    )
    expect(result.snapshot.etag).toBe('"models-123"')
    expect(result.snapshot.models[0]).toMatchObject({
      slug: 'gpt-5.4',
      displayName: 'GPT-5.4',
      defaultReasoningLevel: 'medium',
      supportedReasoningLevels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
      ],
    })
  })

  it('keeps the cached snapshot on 304 and derives picker-visible defaults', async () => {
    const cached: OpenAIModelCatalogSnapshot = {
      models: [
        {
          slug: 'gpt-5.4',
          displayName: 'GPT-5.4',
          description: 'Most capable general model',
          defaultReasoningLevel: 'medium',
          supportedReasoningLevels: [
            { effort: 'low', description: 'low' },
            { effort: 'medium', description: 'medium' },
            { effort: 'high', description: 'high' },
          ],
          visibility: 'list',
          supportedInApi: true,
          priority: 1,
        },
        {
          slug: 'gpt-5.4-mini',
          displayName: 'GPT-5.4-Mini',
          description: 'Fastest GPT-5.4 variant',
          defaultReasoningLevel: 'low',
          supportedReasoningLevels: [{ effort: 'low', description: 'low' }],
          visibility: 'list',
          supportedInApi: true,
          priority: 3,
        },
        {
          slug: 'gpt-hidden',
          displayName: 'Hidden',
          description: 'Hidden from picker',
          defaultReasoningLevel: null,
          supportedReasoningLevels: [],
          visibility: 'hide',
          supportedInApi: true,
          priority: 99,
        },
      ],
      etag: '"cached"',
      fetchedAt: '2026-04-08T00:00:00.000Z',
      clientVersion: '0.0.0-source',
    }

    saveGlobalConfig(() => ({
      ...DEFAULT_GLOBAL_CONFIG,
      openaiModelCatalogCache: cached,
    }))

    const snapshot = await refreshOpenAIModelCatalog({
      auth: AUTH,
      refreshAuth: false,
      env: {
        OPENAI_BASE_URL: 'https://codex.example.test',
      },
      fetchImpl: async () =>
        new Response(null, {
          status: 304,
          headers: {
            ETag: '"cached"',
          },
        }),
    })

    expect(snapshot).toEqual(cached)
    expect(getVisibleOpenAIModelCatalogEntries().map(entry => entry.slug)).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
    ])
    expect(getDefaultOpenAIModel()).toBe('gpt-5.4')
  })

  it('filters picker-visible models to API-supported entries only', async () => {
    const result = await fetchOpenAIModelCatalog({
      auth: AUTH,
      env: {
        OPENAI_BASE_URL: 'https://codex.example.test',
      },
      fetchImpl: async () =>
        new Response(JSON.stringify(FIXTURE_MODELS_RESPONSE), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      throw new Error('expected ok models response')
    }

    saveGlobalConfig(() => ({
      ...DEFAULT_GLOBAL_CONFIG,
      openaiModelCatalogCache: result.snapshot,
    }))

    expect(getVisibleOpenAIModelCatalogEntries().map(entry => entry.slug)).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
    ])
  })

  it('synthesizes a fallback snapshot from default and small model env vars', () => {
    const snapshot = getFallbackOpenAIModelCatalogSnapshot({
      OPENAI_DEFAULT_MODEL: 'gpt-5.3-codex',
      OPENAI_SMALL_MODEL: 'gpt-5.4-mini',
    })

    expect(snapshot.models.map(model => model.slug)).toEqual([
      'gpt-5.3-codex',
      'gpt-5.4-mini',
    ])
    expect(snapshot.models[0]?.displayName).toBe('GPT-5.3-Codex')
    expect(snapshot.models[1]?.displayName).toBe('GPT-5.4-Mini')
  })

  it('accepts catalog models and raw OpenAI ids while rejecting unknown ids', () => {
    saveGlobalConfig(() => ({
      ...DEFAULT_GLOBAL_CONFIG,
      openaiModelCatalogCache: {
        models: [
          {
            slug: 'gpt-5.4',
            displayName: 'GPT-5.4',
            description: null,
            defaultReasoningLevel: 'medium',
            supportedReasoningLevels: [],
            visibility: 'list',
            supportedInApi: true,
            priority: 10,
          },
        ],
        etag: null,
        fetchedAt: '2026-04-08T00:00:00.000Z',
        clientVersion: '0.0.0-source',
      },
    }))

    expect(isKnownOpenAIModel('gpt-5.4')).toBe(true)
    expect(isKnownOpenAIModel('gpt-5.4-custom-preview')).toBe(true)
    expect(isKnownOpenAIModel('codex-mini-latest')).toBe(true)
    expect(isKnownOpenAIModel('legacy-preview')).toBe(false)
  })
})
