import { afterEach, describe, expect, it } from 'bun:test'
import { DEFAULT_GLOBAL_CONFIG, saveGlobalConfig } from 'src/utils/config.js'
import { getModelOptions } from 'src/utils/model/modelOptions.js'

const OPENAI_MODEL_CACHE = {
  models: [
    {
      slug: 'gpt-5.4',
      displayName: 'GPT-5.4',
      description: 'Frontier general-purpose model',
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
      slug: 'gpt-5.3-codex',
      displayName: 'GPT-5.3-Codex',
      description: 'Codex-optimized model',
      defaultReasoningLevel: 'medium',
      supportedReasoningLevels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
      ],
      visibility: 'list',
      supportedInApi: true,
      priority: 5,
    },
    {
      slug: 'gpt-5.3-codex-spark',
      displayName: 'GPT-5.3-Codex-Spark',
      description: 'Ultra-fast coding model',
      defaultReasoningLevel: 'high',
      supportedReasoningLevels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
      ],
      visibility: 'list',
      supportedInApi: false,
      priority: 6,
    },
    {
      slug: 'gpt-5.2',
      displayName: 'GPT-5.2',
      description: 'Previous-generation frontier model',
      defaultReasoningLevel: 'medium',
      supportedReasoningLevels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
      ],
      visibility: 'list',
      supportedInApi: true,
      priority: 9,
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
  etag: '"fixture-models"',
  fetchedAt: '2026-04-08T00:00:00.000Z',
  clientVersion: '0.0.0-source',
} as const

function resetGlobalConfig(): void {
  saveGlobalConfig(() => ({ ...DEFAULT_GLOBAL_CONFIG }))
}

describe('OpenAI model picker options', () => {
  afterEach(() => {
    resetGlobalConfig()
  })

  it('derives picker-visible options from the live catalog in backend priority order', () => {
    saveGlobalConfig(() => ({
      ...DEFAULT_GLOBAL_CONFIG,
      openaiModelCatalogCache: OPENAI_MODEL_CACHE,
    }))

    expect(getModelOptions(false)).toEqual([
      {
        value: 'gpt-5.4',
        label: 'GPT-5.4',
        description: 'Frontier general-purpose model',
        descriptionForModel: 'Frontier general-purpose model',
      },
      {
        value: 'gpt-5.4-mini',
        label: 'GPT-5.4-Mini',
        description: 'Fastest GPT-5.4 variant',
        descriptionForModel: 'Fastest GPT-5.4 variant',
      },
      {
        value: 'gpt-5.3-codex',
        label: 'GPT-5.3-Codex',
        description: 'Codex-optimized model',
        descriptionForModel: 'Codex-optimized model',
      },
      {
        value: 'gpt-5.2',
        label: 'GPT-5.2',
        description: 'Previous-generation frontier model',
        descriptionForModel: 'Previous-generation frontier model',
      },
    ])
  })
})
