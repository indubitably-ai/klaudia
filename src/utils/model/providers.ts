import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { resolveProviderSessionFromEnvironment } from '../../provider/providerSession.js'
import {
  getActiveProviderConfig,
  getUnsupportedLegacyProviderEnv,
} from '../../provider/providerRegistry.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export function getAPIProvider(): APIProvider {
  return resolveProviderSessionFromEnvironment().provider
}

export function getBuiltinProviderId(): 'openai' {
  return getActiveProviderConfig().id
}

export function getUnsupportedProviderEnvDiagnostics(): string[] {
  return getUnsupportedLegacyProviderEnv()
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = getActiveProviderConfig().baseUrl
  if (!baseUrl || baseUrl === 'https://chatgpt.com/backend-api/codex') {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    return host === 'chatgpt.com'
  } catch {
    return false
  }
}
