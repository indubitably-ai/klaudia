import { isEnvTruthy } from 'src/utils/envUtils.js'
import { readOpenAIAuthState } from './openaiAuthManager.js'

export type ProviderId = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export type ProviderAuthMode = 'none' | 'apiKey' | 'oauth' | 'cloud'

export type ProviderAccountKind = 'unknown' | 'api' | 'subscription' | 'cloud'

export type ProviderPlan =
  | 'free'
  | 'go'
  | 'plus'
  | 'pro'
  | 'max'
  | 'team'
  | 'business'
  | 'enterprise'
  | 'edu'
  | 'unknown'

export type ProviderSessionInput = {
  useBedrock?: boolean
  useVertex?: boolean
  useFoundry?: boolean
  hasApiKey?: boolean
  hasOAuthToken?: boolean
  hasProfileScope?: boolean
  subscriptionType?: string | null
}

export type ProviderSession = {
  provider: ProviderId
  authMode: ProviderAuthMode
  accountKind: ProviderAccountKind
  plan: ProviderPlan
  isFirstParty: boolean
  isSubscribed: boolean
}

export function normalizeProviderPlan(
  rawPlan: string | null | undefined,
): ProviderPlan {
  const normalized = rawPlan?.trim().toLowerCase()

  switch (normalized) {
    case 'free':
    case 'go':
    case 'plus':
    case 'pro':
    case 'max':
    case 'team':
    case 'business':
    case 'enterprise':
    case 'edu':
      return normalized
    case 'claude_pro':
      return 'pro'
    case 'claude_max':
      return 'max'
    case 'claude_team':
      return 'team'
    case 'claude_enterprise':
      return 'enterprise'
    default:
      return 'unknown'
  }
}

function resolveProvider(input: ProviderSessionInput): ProviderId {
  if (input.useBedrock) {
    return 'bedrock'
  }

  if (input.useVertex) {
    return 'vertex'
  }

  if (input.useFoundry) {
    return 'foundry'
  }

  return 'firstParty'
}

function resolveAuthMode(
  provider: ProviderId,
  input: ProviderSessionInput,
): ProviderAuthMode {
  if (provider !== 'firstParty') {
    return 'cloud'
  }

  if (input.hasOAuthToken) {
    return 'oauth'
  }

  if (input.hasApiKey) {
    return 'apiKey'
  }

  return 'none'
}

export function resolveProviderSession(
  input: ProviderSessionInput,
): ProviderSession {
  const provider = resolveProvider(input)
  const authMode = resolveAuthMode(provider, input)
  const plan =
    authMode === 'oauth' && input.hasProfileScope
      ? normalizeProviderPlan(input.subscriptionType)
      : 'unknown'

  let accountKind: ProviderAccountKind = 'unknown'
  if (provider !== 'firstParty') {
    accountKind = 'cloud'
  } else if (authMode === 'oauth' && plan !== 'unknown') {
    accountKind = 'subscription'
  } else if (authMode === 'oauth' || authMode === 'apiKey') {
    accountKind = 'api'
  }

  return {
    provider,
    authMode,
    accountKind,
    plan,
    isFirstParty: provider === 'firstParty',
    isSubscribed: accountKind === 'subscription',
  }
}

export function resolveProviderSessionFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSession {
  const openaiAuth = readOpenAIAuthState(env)
  return resolveProviderSession({
    useBedrock: false,
    useVertex: false,
    useFoundry: false,
    hasApiKey: false,
    hasOAuthToken: Boolean(openaiAuth?.tokens.accessToken),
    hasProfileScope: Boolean(
      openaiAuth?.account.email || openaiAuth?.account.plan !== 'unknown',
    ),
    subscriptionType: openaiAuth?.account.plan ?? null,
  })
}
