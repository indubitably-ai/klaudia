import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  deleteOpenAIAuthState,
  getCodexAuthFilePath,
  getOpenAIAuthFilePath,
  getInteractiveOpenAIAuthStatus,
  importCodexAuthState,
  parseChatGPTJwtClaims,
  readOpenAIAuthState,
  refreshOpenAIAuthStateIfNeeded,
  resolveOpenAIAuthStorageMode,
  shouldRefreshOpenAIAuthState,
  writeOpenAIAuthState,
} from 'src/provider/openaiAuthManager.js'
import { OPENAI_AUTH_CLIENT_ID } from 'src/services/openaiAuth/index.js'
import { createTempWorkspace } from '../support/fs.js'

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
}

function recentLastRefresh(minutesAgo = 1): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

describe('openaiAuthManager', () => {
  let homeDir: string

  beforeEach(async () => {
    homeDir = await createTempWorkspace('klaudia-openai-auth-')
  })

  afterEach(() => {
    deleteOpenAIAuthState({ HOME: homeDir })
  })

  it('parses ChatGPT JWT claims into normalized account info', () => {
    const jwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'business',
        chatgpt_user_id: 'user_123',
        chatgpt_account_id: 'acct_123',
      },
    })

    expect(parseChatGPTJwtClaims(jwt)).toEqual({
      email: 'user@example.com',
      plan: 'business',
      userId: 'user_123',
      accountId: 'acct_123',
      rawJwt: jwt,
    })
  })

  it('persists Klaudia auth state in auth.json file mode', () => {
    const jwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_123',
        chatgpt_account_id: 'acct_123',
      },
    })
    const env = {
      HOME: homeDir,
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
    }
    const lastRefresh = recentLastRefresh()

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'browser',
        storageMode: 'file',
        tokens: {
          idToken: jwt,
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
        lastRefresh,
      },
      env,
    )

    expect(resolveOpenAIAuthStorageMode(env)).toBe('file')
    expect(Bun.file(getOpenAIAuthFilePath(env)).size).toBeGreaterThan(0)
    expect(readOpenAIAuthState(env)).toEqual({
      authMode: 'chatgpt',
      authSource: 'browser',
      storageMode: 'file',
      tokens: {
        idToken: jwt,
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
      lastRefresh,
    })
  })

  it('imports Codex auth.json into Klaudia auth.json and marks it as imported', async () => {
    const jwt = createJwt({
      email: 'imported@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_imported',
        chatgpt_account_id: 'acct_imported',
      },
    })
    const env = {
      HOME: homeDir,
      CODEX_HOME: `${homeDir}/.codex`,
    }

    await Bun.write(
      getCodexAuthFilePath(env),
      JSON.stringify(
        {
          auth_mode: 'chatgpt',
          tokens: {
            id_token: jwt,
            access_token: 'codex-access-token',
            refresh_token: 'codex-refresh-token',
            account_id: 'acct_imported',
          },
          last_refresh: recentLastRefresh(),
        },
        null,
        2,
      ),
    )

    const imported = importCodexAuthState(env)
    expect(imported.authSource).toBe('codex-import')
    expect(imported.account).toEqual({
      email: 'imported@example.com',
      plan: 'plus',
      userId: 'user_imported',
      accountId: 'acct_imported',
    })
    expect(readOpenAIAuthState(env)?.tokens.accessToken).toBe(
      'codex-access-token',
    )
  })

  it('does not auto-sync from ~/.codex/auth.json during reads', async () => {
    const staleJwt = createJwt({
      email: 'stored@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_stored',
        chatgpt_account_id: 'acct_shared',
      },
    })
    const freshJwt = createJwt({
      email: 'codex@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_codex',
        chatgpt_account_id: 'acct_shared',
      },
    })
    const env = {
      HOME: homeDir,
      CODEX_HOME: `${homeDir}/.codex`,
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
    }

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'codex-import',
        storageMode: 'file',
        tokens: {
          idToken: staleJwt,
          accessToken: 'stored-access-token',
          refreshToken: 'stored-refresh-token',
          accountId: 'acct_shared',
        },
        account: {
          email: 'stored@example.com',
          plan: 'plus',
          userId: 'user_stored',
          accountId: 'acct_shared',
        },
        lastRefresh: recentLastRefresh(60 * 24 * 14),
      },
      env,
    )

    await Bun.write(
      getCodexAuthFilePath(env),
      JSON.stringify(
        {
          auth_mode: 'chatgpt',
          tokens: {
            id_token: freshJwt,
            access_token: 'fresh-access-token',
            refresh_token: 'fresh-refresh-token',
            account_id: 'acct_shared',
          },
          last_refresh: recentLastRefresh(60 * 24),
        },
        null,
        2,
      ),
    )

    const stored = readOpenAIAuthState(env)
    expect(stored?.tokens.accessToken).toBe('stored-access-token')
    expect(stored?.account.email).toBe('stored@example.com')
  })

  it('refreshes a stored ChatGPT subscription token using form-urlencoded grant data', async () => {
    const currentJwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_old',
        chatgpt_account_id: 'acct_old',
      },
    })
    const refreshedJwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_new',
        chatgpt_account_id: 'acct_new',
      },
    })
    const env = {
      HOME: homeDir,
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
      CODEX_REFRESH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
    }

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'browser',
        storageMode: 'file',
        tokens: {
          idToken: currentJwt,
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          accountId: 'acct_old',
        },
        account: {
          email: 'user@example.com',
          plan: 'plus',
          userId: 'user_old',
          accountId: 'acct_old',
        },
        lastRefresh: '2026-04-03T00:00:00.000Z',
      },
      env,
    )

    expect(shouldRefreshOpenAIAuthState(readOpenAIAuthState(env))).toBe(true)

    const refreshed = await refreshOpenAIAuthStateIfNeeded(env, {
      fetchImpl: async (input, init) => {
        expect(input).toBe('https://auth.example.test/oauth/token')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        })
        const body = String(init?.body ?? '')
        expect(body).toContain(`client_id=${OPENAI_AUTH_CLIENT_ID}`)
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=old-refresh-token')

        return new Response(
          JSON.stringify({
            id_token: refreshedJwt,
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )
      },
    })

    expect(refreshed?.tokens.accessToken).toBe('new-access-token')
    expect(refreshed?.account.plan).toBe('pro')
    expect(refreshed?.account.userId).toBe('user_new')
  })

  it('reports missing interactive auth when no Klaudia auth exists', async () => {
    await expect(getInteractiveOpenAIAuthStatus({ HOME: homeDir })).resolves.toEqual(
      { status: 'missing' },
    )
  })

  it('reports ok interactive auth when refresh succeeds', async () => {
    const currentJwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_old',
        chatgpt_account_id: 'acct_old',
      },
    })
    const refreshedJwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_new',
        chatgpt_account_id: 'acct_new',
      },
    })
    const env = {
      HOME: homeDir,
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
      CODEX_REFRESH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
    }

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'browser',
        storageMode: 'file',
        tokens: {
          idToken: currentJwt,
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          accountId: 'acct_old',
        },
        account: {
          email: 'user@example.com',
          plan: 'plus',
          userId: 'user_old',
          accountId: 'acct_old',
        },
        lastRefresh: '2026-04-03T00:00:00.000Z',
      },
      env,
    )

    await expect(
      getInteractiveOpenAIAuthStatus(env, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              id_token: refreshedJwt,
              access_token: 'new-access-token',
              refresh_token: 'new-refresh-token',
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
      }),
    ).resolves.toEqual({ status: 'ok' })
  })

  it('reports imported-token refresh failures with a precise reason', async () => {
    const currentJwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_old',
        chatgpt_account_id: 'acct_old',
      },
    })
    const env = {
      HOME: homeDir,
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
      CODEX_REFRESH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
    }

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'codex-import',
        storageMode: 'file',
        tokens: {
          idToken: currentJwt,
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          accountId: 'acct_old',
        },
        account: {
          email: 'user@example.com',
          plan: 'plus',
          userId: 'user_old',
          accountId: 'acct_old',
        },
        lastRefresh: '2026-04-03T00:00:00.000Z',
      },
      env,
    )

    await expect(
      getInteractiveOpenAIAuthStatus(env, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'refresh_token_reused',
                message: 'refresh token already used',
              },
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
      }),
    ).resolves.toEqual({
      status: 'relogin_required',
      authSource: 'codex-import',
      reason: 'refresh_token_reused',
    })
  })
})
