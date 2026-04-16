import { describe, expect, it } from 'bun:test'
import {
  normalizeProviderPlan,
  resolveProviderSession,
} from 'src/provider/providerSession.js'

describe('providerSession', () => {
  it('resolves first-party API key sessions as API usage', () => {
    expect(
      resolveProviderSession({
        hasApiKey: true,
      }),
    ).toEqual({
      provider: 'firstParty',
      authMode: 'apiKey',
      accountKind: 'api',
      plan: 'unknown',
      isFirstParty: true,
      isSubscribed: false,
    })
  })

  it('resolves first-party OAuth subscription sessions with a normalized plan', () => {
    expect(
      resolveProviderSession({
        hasOAuthToken: true,
        hasProfileScope: true,
        subscriptionType: 'team',
      }),
    ).toEqual({
      provider: 'firstParty',
      authMode: 'oauth',
      accountKind: 'subscription',
      plan: 'team',
      isFirstParty: true,
      isSubscribed: true,
    })
  })

  it('treats first-party OAuth sessions without a known subscription as API usage', () => {
    expect(
      resolveProviderSession({
        hasOAuthToken: true,
      }),
    ).toEqual({
      provider: 'firstParty',
      authMode: 'oauth',
      accountKind: 'api',
      plan: 'unknown',
      isFirstParty: true,
      isSubscribed: false,
    })
  })

  it('prefers bedrock over other provider flags and resolves cloud auth', () => {
    expect(
      resolveProviderSession({
        useBedrock: true,
        useVertex: true,
        hasApiKey: true,
        hasOAuthToken: true,
        subscriptionType: 'enterprise',
      }),
    ).toEqual({
      provider: 'bedrock',
      authMode: 'cloud',
      accountKind: 'cloud',
      plan: 'unknown',
      isFirstParty: false,
      isSubscribed: false,
    })
  })

  it('normalizes current Anthropic and Codex-style plan names', () => {
    expect(
      [
        normalizeProviderPlan('max'),
        normalizeProviderPlan('pro'),
        normalizeProviderPlan('plus'),
        normalizeProviderPlan('enterprise'),
        normalizeProviderPlan('claude_team'),
        normalizeProviderPlan('business'),
        normalizeProviderPlan(''),
        normalizeProviderPlan(null),
        normalizeProviderPlan('something-else'),
      ],
    ).toEqual([
      'max',
      'pro',
      'plus',
      'enterprise',
      'team',
      'business',
      'unknown',
      'unknown',
      'unknown',
    ])
  })
})
