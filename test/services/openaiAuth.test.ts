import { describe, expect, it } from 'bun:test'
import {
  buildOpenAIAuthUrl,
  exchangeOpenAIAuthCode,
  getOpenAIAuthCallbackPort,
  OPENAI_AUTH_CALLBACK_PATH,
  OPENAI_AUTH_CALLBACK_PORT,
  OPENAI_AUTH_CLIENT_ID,
  OPENAI_AUTH_ORIGINATOR,
  OpenAIAuthTokenError,
  refreshOpenAIAuthTokens,
} from 'src/services/openaiAuth/index.js'

describe('services/openaiAuth', () => {
  it('defaults the browser callback listener to Codex port 1455', () => {
    expect(getOpenAIAuthCallbackPort({})).toBe(OPENAI_AUTH_CALLBACK_PORT)
  })

  it('builds the browser authorize URL with PKCE and localhost callback parameters', () => {
    const url = new URL(
      buildOpenAIAuthUrl({
        codeChallenge: 'challenge-123',
        state: 'state-456',
        port: 43121,
        env: {},
      }),
    )

    expect(url.origin).toBe('https://auth.openai.com')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe(OPENAI_AUTH_CLIENT_ID)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe(
      `http://localhost:43121${OPENAI_AUTH_CALLBACK_PATH}`,
    )
    expect(url.searchParams.get('code_challenge')).toBe('challenge-123')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('state-456')
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
    expect(url.searchParams.get('scope')).toContain('openid')
    expect(url.searchParams.get('scope')).toContain('offline_access')
    expect(url.searchParams.get('originator')).toBe(OPENAI_AUTH_ORIGINATOR)
  })

  it('honors the Codex originator override when present', () => {
    const url = new URL(
      buildOpenAIAuthUrl({
        codeChallenge: 'challenge-123',
        state: 'state-456',
        port: 43121,
        env: {
          CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'Codex Desktop',
        },
      }),
    )

    expect(url.searchParams.get('originator')).toBe('Codex Desktop')
  })

  it('exchanges an authorization code via application/x-www-form-urlencoded', async () => {
    const payload = await exchangeOpenAIAuthCode({
      authorizationCode: 'auth-code-123',
      codeVerifier: 'verifier-456',
      port: 43121,
      env: {
        CODEX_AUTH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
      },
      fetchImpl: async (input, init) => {
        expect(input).toBe('https://auth.example.test/oauth/token')
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        })

        const body = String(init?.body ?? '')
        expect(body).toContain(`client_id=${OPENAI_AUTH_CLIENT_ID}`)
        expect(body).toContain('grant_type=authorization_code')
        expect(body).toContain('code=auth-code-123')
        expect(body).toContain(
          `redirect_uri=${encodeURIComponent(`http://localhost:43121${OPENAI_AUTH_CALLBACK_PATH}`)}`,
        )
        expect(body).toContain('code_verifier=verifier-456')
        expect(body).not.toContain('state=')

        return new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            id_token: 'header.payload.signature',
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

    expect(payload).toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      id_token: 'header.payload.signature',
    })
  })

  it('maps refresh_token_reused responses to a typed refresh failure', async () => {
    await expect(
      refreshOpenAIAuthTokens('refresh-token', {
        env: {
          CODEX_AUTH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
        },
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
    ).rejects.toMatchObject({
      name: OpenAIAuthTokenError.name,
      reason: 'refresh_token_reused',
      grantType: 'refresh_token',
      status: 401,
    })
  })

  it('maps revoked and expired refresh-token errors to distinct reasons', async () => {
    await expect(
      refreshOpenAIAuthTokens('refresh-token', {
        env: {
          CODEX_AUTH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
        },
        fetchImpl: async () =>
          new Response('refresh token revoked', {
            status: 401,
            headers: {
              'Content-Type': 'text/plain',
            },
          }),
      }),
    ).rejects.toMatchObject({
      reason: 'refresh_token_revoked',
    })

    await expect(
      refreshOpenAIAuthTokens('refresh-token', {
        env: {
          CODEX_AUTH_TOKEN_URL_OVERRIDE: 'https://auth.example.test/oauth/token',
        },
        fetchImpl: async () =>
          new Response('refresh token expired', {
            status: 401,
            headers: {
              'Content-Type': 'text/plain',
            },
          }),
      }),
    ).rejects.toMatchObject({
      reason: 'refresh_token_expired',
    })
  })
})
