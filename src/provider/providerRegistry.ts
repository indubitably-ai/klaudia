import { isEnvTruthy } from 'src/utils/envUtils.js'
import {
  normalizeProviderPlan,
  type ProviderPlan,
} from './providerSession.js'

export const OPENAI_PROVIDER_ID = 'openai'
export const OPENAI_PROVIDER_NAME = 'OpenAI / Codex'
export const DEFAULT_OPENAI_BASE_URL = 'https://chatgpt.com/backend-api/codex'
export const DEFAULT_OPENAI_MODEL = 'gpt-5.2-codex'
export const DEFAULT_OPENAI_SMALL_MODEL = 'codex-mini-latest'

export type BuiltinProviderId = typeof OPENAI_PROVIDER_ID

export type RetryConfig = {
  maxAttempts: number
  baseDelayMs: number
  retry429: boolean
  retry5xx: boolean
  retryTransport: boolean
}

export type ModelCatalog = {
  defaultModel: string
  smallModel: string
}

export type ProviderConfig = {
  id: BuiltinProviderId
  compatibilityProvider: 'firstParty'
  name: string
  baseUrl: string
  headers: Record<string, string>
  retry: RetryConfig
  streamIdleTimeoutMs: number
  requiresOpenAIAuth: true
  supportsWebsockets: true
  modelCatalog: ModelCatalog
}

export type ProviderRegistry = {
  activeProviderId: BuiltinProviderId
  providers: Record<BuiltinProviderId, ProviderConfig>
  unsupportedLegacyEnv: string[]
}

const LEGACY_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
] as const

function isConfigured(env: NodeJS.ProcessEnv, key: string): boolean {
  const value = env[key]
  if (!value) {
    return false
  }

  if (key.startsWith('CLAUDE_CODE_USE_')) {
    return isEnvTruthy(value)
  }

  return value.trim().length > 0
}

export function getUnsupportedLegacyProviderEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return LEGACY_ENV_KEYS.filter(key => isConfigured(env, key))
}

export function hasUnsupportedLegacyProviderEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getUnsupportedLegacyProviderEnv(env).length > 0
}

export function resolveOpenAIBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.OPENAI_BASE_URL?.trim()
  return override && override.length > 0 ? override : DEFAULT_OPENAI_BASE_URL
}

export function resolveOpenAIModelCatalog(
  env: NodeJS.ProcessEnv = process.env,
): ModelCatalog {
  return {
    defaultModel:
      env.OPENAI_DEFAULT_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    smallModel:
      env.OPENAI_SMALL_MODEL?.trim() || DEFAULT_OPENAI_SMALL_MODEL,
  }
}

export function createOpenAIProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  const headers: Record<string, string> = {}

  const organization = env.OPENAI_ORGANIZATION?.trim()
  if (organization) {
    headers['OpenAI-Organization'] = organization
  }

  const project = env.OPENAI_PROJECT?.trim()
  if (project) {
    headers['OpenAI-Project'] = project
  }

  return {
    id: OPENAI_PROVIDER_ID,
    compatibilityProvider: 'firstParty',
    name: OPENAI_PROVIDER_NAME,
    baseUrl: resolveOpenAIBaseUrl(env),
    headers,
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
    modelCatalog: resolveOpenAIModelCatalog(env),
  }
}

export function getProviderRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ProviderRegistry {
  const openai = createOpenAIProviderConfig(env)

  return {
    activeProviderId: OPENAI_PROVIDER_ID,
    providers: {
      [OPENAI_PROVIDER_ID]: openai,
    },
    unsupportedLegacyEnv: getUnsupportedLegacyProviderEnv(env),
  }
}

export function getActiveProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  return getProviderRegistry(env).providers[OPENAI_PROVIDER_ID]
}

export function isOpenAIRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getActiveProviderConfig(env).id === OPENAI_PROVIDER_ID
}

export function mapAppModelToProviderModel(
  model: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const catalog = resolveOpenAIModelCatalog(env)
  const normalized = model?.trim().toLowerCase()

  if (!normalized) {
    return catalog.defaultModel
  }

  if (
    normalized.startsWith('gpt-') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4') ||
    normalized.startsWith('codex-')
  ) {
    return model!.trim()
  }

  if (
    normalized.includes('haiku') ||
    normalized.includes('mini') ||
    normalized.includes('small') ||
    normalized.includes('fast')
  ) {
    return catalog.smallModel
  }

  return catalog.defaultModel
}

export function normalizeOpenAIPlan(
  rawPlan: string | null | undefined,
): ProviderPlan {
  return normalizeProviderPlan(rawPlan)
}
