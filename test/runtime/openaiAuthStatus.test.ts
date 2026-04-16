import { chmodSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  getCodexAuthFilePath,
  readOpenAIAuthState,
  writeOpenAIAuthState,
} from 'src/provider/openaiAuthManager.js'
import {
  OPENAI_AUTH_CALLBACK_PATH,
  OPENAI_AUTH_CLIENT_ID,
} from 'src/services/openaiAuth/index.js'
import { createTempWorkspace } from '../support/fs.js'
import {
  detectExpectBinary,
  runInteractiveCliSession,
} from '../support/interactiveRuntime.js'
import { runCliCommand } from '../support/runtime.js'

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
}

function recentLastRefresh(): string {
  return new Date(Date.now() - 60_000).toISOString()
}

describe('runtime auth status', () => {
  const servers: Array<{ stop: () => void }> = []
  const interactiveIt = detectExpectBinary() ? it : it.skip

  afterEach(() => {
    for (const server of servers.splice(0, servers.length)) {
      server.stop()
    }
  })

  it('imports Codex auth through auth import-codex and validates it immediately', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-auth-import-')
    const currentJwt = createJwt({
      email: 'imported@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_imported',
        chatgpt_account_id: 'acct_imported',
      },
    })
    const refreshedJwt = createJwt({
      email: 'imported@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_imported',
        chatgpt_account_id: 'acct_imported',
      },
    })

    await Bun.write(
      getCodexAuthFilePath({ HOME: homeDir }),
      JSON.stringify(
        {
          auth_mode: 'chatgpt',
          tokens: {
            id_token: currentJwt,
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

    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname !== '/oauth/token' || request.method !== 'POST') {
          return new Response('not found', { status: 404 })
        }

        expect(request.headers.get('content-type')).toContain(
          'application/x-www-form-urlencoded',
        )
        const body = await request.text()
        expect(body).toContain(`client_id=${OPENAI_AUTH_CLIENT_ID}`)
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=codex-refresh-token')

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
    servers.push(server)

    const loginResult = await runCliCommand(['auth', 'import-codex'], {
      homeDir,
      env: {
        CODEX_REFRESH_TOKEN_URL_OVERRIDE: `http://127.0.0.1:${server.port}/oauth/token`,
      },
      timeoutMs: 60_000,
    })

    expect(loginResult.error).toBeUndefined()
    expect(loginResult.signal).toBeNull()
    expect(loginResult.status).toBe(0)
    expect(loginResult.traceEvents).toEqual([])
    expect(loginResult.stderr).toBe('')
    expect(loginResult.stdout).toContain('Imported and refreshed pro subscription auth')
    expect(loginResult.stdout).toContain('imported@example.com')

    expect(readOpenAIAuthState({ HOME: homeDir })).toMatchObject({
      authSource: 'codex-import',
      tokens: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accountId: 'acct_imported',
      },
      account: {
        email: 'imported@example.com',
        plan: 'pro',
        userId: 'user_imported',
        accountId: 'acct_imported',
      },
    })

    const statusResult = await runCliCommand(['auth', 'status', '--json'], {
      homeDir,
    })

    expect(statusResult.status).toBe(0)
    expect(JSON.parse(statusResult.stdout)).toMatchObject({
      loggedIn: true,
      authMethod: 'chatgpt',
      providerId: 'openai',
      email: 'imported@example.com',
      accountId: 'acct_imported',
      subscriptionType: 'pro',
    })
  })

  interactiveIt('completes the browser-based auth login flow in a PTY session', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-auth-browser-')
    const jwt = createJwt({
      email: 'browser@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_browser',
        chatgpt_account_id: 'acct_browser',
      },
    })
    let authorizeRedirectUri: string | null = null

    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)

        if (url.pathname === '/oauth/authorize') {
          expect(url.searchParams.get('client_id')).toBe(OPENAI_AUTH_CLIENT_ID)
          expect(url.searchParams.get('response_type')).toBe('code')
          expect(url.searchParams.get('code_challenge_method')).toBe('S256')
          authorizeRedirectUri = url.searchParams.get('redirect_uri')
          expect(authorizeRedirectUri).toBeTruthy()
          expect(authorizeRedirectUri).toContain('http://localhost:')
          expect(
            authorizeRedirectUri?.endsWith(OPENAI_AUTH_CALLBACK_PATH),
          ).toBe(true)
          expect(url.searchParams.get('scope')).toContain('openid')

          return Response.redirect(
            `${url.searchParams.get('redirect_uri')}?code=auth-code-123&state=${url.searchParams.get('state')}`,
            302,
          )
        }

        if (url.pathname === '/oauth/token' && request.method === 'POST') {
          expect(request.headers.get('content-type')).toContain(
            'application/x-www-form-urlencoded',
          )
          const body = await request.text()
          expect(body).toContain('grant_type=authorization_code')
          expect(body).toContain('code=auth-code-123')
          expect(body).toContain(`client_id=${OPENAI_AUTH_CLIENT_ID}`)
          expect(authorizeRedirectUri).toBeTruthy()
          expect(body).toContain(
            `redirect_uri=${encodeURIComponent(authorizeRedirectUri ?? '')}`,
          )
          expect(body).toContain('code_verifier=')
          expect(body).not.toContain('state=')

          return new Response(
            JSON.stringify({
              access_token: 'browser-access-token',
              refresh_token: 'browser-refresh-token',
              id_token: jwt,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        return new Response('not found', { status: 404 })
      },
    })
    servers.push(server)

    const browserScript = join(homeDir, 'open-browser.sh')
    await Bun.write(
      browserScript,
      '#!/bin/sh\ncurl -fsSL "$1" >/dev/null 2>&1\n',
    )
    chmodSync(browserScript, 0o755)

    const result = await runInteractiveCliSession({
      homeDir,
      args: ['auth', 'login'],
      env: {
        CODEX_AUTH_ISSUER_URL_OVERRIDE: `http://127.0.0.1:${server.port}`,
        CODEX_AUTH_CALLBACK_PORT_OVERRIDE: '0',
        BROWSER: browserScript,
      },
      timeoutMs: 60_000,
      scriptBody: `
expect_re {ChatGPT/Codex}
expect_re {oauth/authorize}
expect_re {browser@example.com}
expect_re {Enter to continu}
send_enter
expect_eof
`,
    })

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])

    const statusResult = await runCliCommand(['auth', 'status', '--json'], {
      homeDir,
    })

    expect(statusResult.status).toBe(0)
    expect(JSON.parse(statusResult.stdout)).toMatchObject({
      loggedIn: true,
      authMethod: 'chatgpt',
      providerId: 'openai',
      email: 'browser@example.com',
      accountId: 'acct_browser',
      subscriptionType: 'pro',
    })
  }, 120_000)

  it('reports stored OpenAI/Codex subscription auth', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-auth-')
    const jwt = createJwt({
      email: 'user@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'plus',
        chatgpt_user_id: 'user_123',
        chatgpt_account_id: 'acct_123',
      },
    })

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
          plan: 'plus',
          userId: 'user_123',
          accountId: 'acct_123',
        },
        lastRefresh: recentLastRefresh(),
      },
      { HOME: homeDir },
    )

    const result = await runCliCommand(['auth', 'status', '--json'], {
      homeDir,
    })

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.traceEvents).toEqual([])

    const payload = JSON.parse(result.stdout)
    expect(payload).toEqual({
      loggedIn: true,
      authMethod: 'chatgpt',
      apiProvider: 'firstParty',
      providerId: 'openai',
      authTokenSource: 'chatgpt',
      email: 'user@example.com',
      accountId: 'acct_123',
      subscriptionType: 'plus',
      unsupportedLegacyEnv: [],
    })
  })

  it('fails cleanly when removed legacy auth-login flags are used', async () => {
    const result = await runCliCommand(['auth', 'login', '--email', 'user@example.com'])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("unknown option '--email'")
  })
})
