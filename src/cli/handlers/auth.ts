/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import {
  clearAuthRelatedCaches,
  performLogout,
} from '../../commands/logout/logout.js'
import {
  importCodexAuthState,
  parseChatGPTJwtClaims,
  readOpenAIAuthState,
  refreshOpenAIAuthStateIfNeeded,
  writeOpenAIAuthState,
} from '../../provider/openaiAuthManager.js'
import { getUnsupportedLegacyProviderEnv } from '../../provider/providerRegistry.js'
import {
  getOpenAIAuthRecoveryCopy,
  getOpenAIAuthStatusMissingMessage,
} from '../../services/openaiAuth/messages.js'
import { OpenAIAuthTokenError } from '../../services/openaiAuth/index.js'
import {
  getAuthTokenSource,
  getOauthAccountInfo,
  getSubscriptionType,
} from '../../utils/auth.js'
import { errorMessage } from '../../utils/errors.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
} from '../../utils/status.js'

export async function installOAuthTokens(tokens: Record<string, any>): Promise<void> {
  const accessToken = tokens.accessToken || tokens.access_token
  const refreshToken =
    tokens.refreshToken || tokens.refresh_token || null
  const idToken = tokens.idToken || tokens.id_token
  const authSource = tokens.authSource === 'codex-import' ? 'codex-import' : 'browser'

  if (!accessToken || !idToken) {
    throw new Error(
      'OpenAI/Codex auth requires both access_token and id_token.',
    )
  }

  const claims = parseChatGPTJwtClaims(idToken)
  writeOpenAIAuthState({
    authMode: 'chatgpt',
    authSource,
    storageMode: 'file',
    tokens: {
      idToken,
      accessToken,
      refreshToken,
      accountId: claims.accountId,
    },
    account: {
      email: claims.email,
      plan: claims.plan,
      userId: claims.userId,
      accountId: claims.accountId,
    },
    lastRefresh: new Date().toISOString(),
  })
  await clearAuthRelatedCaches()
}

export async function authImportCodex(): Promise<void> {
  try {
    const imported = importCodexAuthState()
    if (!imported.tokens.refreshToken) {
      throw new Error(
        'The imported Codex auth file does not include a refresh token. Run `klaudia auth login` for a fresh browser sign-in.',
      )
    }

    const validated = await refreshOpenAIAuthStateIfNeeded(process.env, {
      force: true,
    })

    if (!validated) {
      throw new Error(
        'Imported Codex auth could not be loaded into Klaudia. Run `klaudia auth login` instead.',
      )
    }

    await clearAuthRelatedCaches()
    process.stdout.write(
      `Imported and refreshed ${validated.account.plan === 'unknown' ? 'ChatGPT' : validated.account.plan} subscription auth` +
        `${validated.account.email ? ` for ${validated.account.email}` : ''}.\n`,
    )
    process.exit(0)
  } catch (error) {
    if (error instanceof OpenAIAuthTokenError) {
      process.stderr.write(
        `${getOpenAIAuthRecoveryCopy('codex-import', error.reason).message}\n`,
      )
      process.exit(1)
    }

    process.stderr.write(`${errorMessage(error)}\n`)
    if (
      error instanceof Error &&
      error.message.includes('Sign in with Codex first')
    ) {
      process.stderr.write(
        'Sign in with Codex first, then rerun `klaudia auth import-codex`.\n',
      )
    }
    process.exit(1)
  }
}

export async function authStatus(opts: {
  json?: boolean
  text?: boolean
}): Promise<void> {
  const authState = readOpenAIAuthState()
  const { source: authTokenSource, hasToken } = getAuthTokenSource()
  const oauthAccount = getOauthAccountInfo()
  const subscriptionType = getSubscriptionType()
  const unsupportedLegacyEnv = getUnsupportedLegacyProviderEnv()
  const loggedIn = Boolean(authState?.tokens.accessToken && hasToken)

  if (opts.text) {
    const properties = [
      ...buildAccountProperties(),
      ...buildAPIProviderProperties(),
    ]

    let hasOutput = false
    for (const prop of properties) {
      const value =
        typeof prop.value === 'string'
          ? prop.value
          : Array.isArray(prop.value)
            ? prop.value.join(', ')
            : null

      if (value === null || value === 'none') {
        continue
      }

      hasOutput = true
      if (prop.label) {
        process.stdout.write(`${prop.label}: ${value}\n`)
      } else {
        process.stdout.write(`${value}\n`)
      }
    }

    if (unsupportedLegacyEnv.length > 0) {
      hasOutput = true
      process.stdout.write(
        `Unsupported legacy env: ${unsupportedLegacyEnv.join(', ')}\n`,
      )
    }

    if (!hasOutput) {
      process.stdout.write(`${getOpenAIAuthStatusMissingMessage()}\n`)
    }
  } else {
    process.stdout.write(
      jsonStringify(
        {
          loggedIn,
          authMethod: loggedIn ? 'chatgpt' : 'none',
          apiProvider: 'firstParty',
          providerId: 'openai',
          authTokenSource: loggedIn ? authTokenSource : null,
          email: oauthAccount?.emailAddress ?? null,
          accountId: oauthAccount?.organizationUuid ?? null,
          subscriptionType: subscriptionType ?? null,
          unsupportedLegacyEnv,
        },
        null,
        2,
      ) + '\n',
    )
  }

  process.exit(loggedIn ? 0 : 1)
}

export async function authLogout(): Promise<void> {
  try {
    await performLogout({ clearOnboarding: false })
  } catch {
    process.stderr.write('Failed to log out.\n')
    process.exit(1)
  }

  process.stdout.write('Successfully logged out from your OpenAI/Codex account.\n')
  process.exit(0)
}
