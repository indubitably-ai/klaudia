import { request as httpRequest } from 'http'
import type { ServerResponse } from 'http'
import { logEvent } from 'src/services/analytics/index.js'
import { openBrowser } from '../../utils/browser.js'
import { AuthCodeListener } from '../oauth/auth-code-listener.js'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '../oauth/crypto.js'

export const OPENAI_AUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const OPENAI_AUTH_ISSUER_URL = 'https://auth.openai.com'
export const OPENAI_AUTH_CALLBACK_PATH = '/auth/callback'
export const OPENAI_AUTH_CALLBACK_PORT = 1455
export const OPENAI_AUTH_CALLBACK_HOST = '127.0.0.1'
export const OPENAI_AUTH_ORIGINATOR = 'codex_cli_rs'
export const OPENAI_AUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'api.connectors.read',
  'api.connectors.invoke',
] as const

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type OpenAIAuthSource = 'browser' | 'codex-import'

export type OpenAIAuthFailureReason =
  | 'refresh_token_reused'
  | 'refresh_token_expired'
  | 'refresh_token_revoked'
  | 'unknown'

type TokenGrantType = 'authorization_code' | 'refresh_token'

type OpenAIAuthTokenErrorPayload = {
  error?:
    | string
    | {
        code?: string | null
        message?: string | null
      }
    | null
  error_description?: string | null
  message?: string | null
} | null

export type OpenAIAuthTokenResponse = {
  access_token?: string | null
  refresh_token?: string | null
  id_token?: string | null
  scope?: string | null
  expires_in?: number | null
}

export type OpenAIBrowserLoginTokens = {
  accessToken: string
  refreshToken: string | null
  idToken: string
}

export class OpenAIAuthTokenError extends Error {
  readonly reason: OpenAIAuthFailureReason
  readonly status: number
  readonly grantType: TokenGrantType
  readonly responseBody: string

  constructor(params: {
    message: string
    reason: OpenAIAuthFailureReason
    status: number
    grantType: TokenGrantType
    responseBody: string
  }) {
    super(params.message)
    this.name = 'OpenAIAuthTokenError'
    this.reason = params.reason
    this.status = params.status
    this.grantType = params.grantType
    this.responseBody = params.responseBody
  }
}

function getOpenAIAuthIssuerUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.CODEX_AUTH_ISSUER_URL_OVERRIDE || OPENAI_AUTH_ISSUER_URL
}

export function getOpenAIAuthAuthorizeUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.CODEX_AUTH_AUTHORIZE_URL_OVERRIDE ||
    new URL('/oauth/authorize', getOpenAIAuthIssuerUrl(env)).toString()
  )
}

export function getOpenAIAuthTokenUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.CODEX_AUTH_TOKEN_URL_OVERRIDE ||
    env.CODEX_REFRESH_TOKEN_URL_OVERRIDE ||
    new URL('/oauth/token', getOpenAIAuthIssuerUrl(env)).toString()
  )
}

export function getOpenAIAuthOriginator(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const originator = env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE?.trim()
  return originator && originator.length > 0
    ? originator
    : OPENAI_AUTH_ORIGINATOR
}

export function getOpenAIAuthCallbackPort(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const rawPort = env.CODEX_AUTH_CALLBACK_PORT_OVERRIDE?.trim()
  if (!rawPort) {
    return OPENAI_AUTH_CALLBACK_PORT
  }

  const parsedPort = Number.parseInt(rawPort, 10)
  if (
    Number.isInteger(parsedPort) &&
    parsedPort >= 0 &&
    parsedPort <= 65_535
  ) {
    return parsedPort
  }

  return OPENAI_AUTH_CALLBACK_PORT
}

function isAddressInUseError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'EADDRINUSE',
  )
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function sendCancelRequest(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(
      {
        host: OPENAI_AUTH_CALLBACK_HOST,
        port,
        method: 'GET',
        path: '/cancel',
      },
      response => {
        response.resume()
        response.on('end', resolve)
      },
    )

    request.on('error', reject)
    request.setTimeout(2_000, () => {
      request.destroy(new Error('Timed out cancelling stale login server'))
    })
    request.end()
  })
}

export async function startOpenAICallbackListener(
  listener: AuthCodeListener,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const requestedPort = getOpenAIAuthCallbackPort(env)
  if (requestedPort === 0) {
    return listener.start(0, OPENAI_AUTH_CALLBACK_HOST)
  }

  let attemptedCancel = false
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await listener.start(requestedPort, OPENAI_AUTH_CALLBACK_HOST)
    } catch (error) {
      if (!isAddressInUseError(error)) {
        throw error
      }

      if (!attemptedCancel) {
        attemptedCancel = true
        await sendCancelRequest(requestedPort).catch(() => {})
      }

      if (attempt === 9) {
        throw error
      }

      await delay(200)
    }
  }

  throw new Error('Failed to start the ChatGPT/Codex callback listener.')
}

function buildOpenAICallbackUrl(port: number): string {
  return `http://localhost:${port}${OPENAI_AUTH_CALLBACK_PATH}`
}

export function buildOpenAIAuthUrl(params: {
  codeChallenge: string
  state: string
  port: number
  env?: NodeJS.ProcessEnv
}): string {
  const authUrl = new URL(getOpenAIAuthAuthorizeUrl(params.env))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', OPENAI_AUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', buildOpenAICallbackUrl(params.port))
  authUrl.searchParams.set('scope', OPENAI_AUTH_SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', params.codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('id_token_add_organizations', 'true')
  authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
  authUrl.searchParams.set('state', params.state)
  authUrl.searchParams.set('originator', getOpenAIAuthOriginator(params.env))
  return authUrl.toString()
}

function extractErrorStrings(
  payload: OpenAIAuthTokenErrorPayload,
  responseBody: string,
): string[] {
  const strings = [responseBody]

  if (typeof payload?.error === 'string') {
    strings.push(payload.error)
  } else if (payload?.error && typeof payload.error === 'object') {
    if (typeof payload.error.code === 'string') {
      strings.push(payload.error.code)
    }
    if (typeof payload.error.message === 'string') {
      strings.push(payload.error.message)
    }
  }

  if (typeof payload?.error_description === 'string') {
    strings.push(payload.error_description)
  }
  if (typeof payload?.message === 'string') {
    strings.push(payload.message)
  }

  return strings
    .map(value => value.trim())
    .filter(Boolean)
}

function classifyRefreshFailureReason(
  payload: OpenAIAuthTokenErrorPayload,
  responseBody: string,
): OpenAIAuthFailureReason {
  const haystack = extractErrorStrings(payload, responseBody)
    .join(' ')
    .toLowerCase()

  if (haystack.includes('refresh_token_reused') || haystack.includes('already used')) {
    return 'refresh_token_reused'
  }

  if (haystack.includes('refresh_token_revoked') || haystack.includes('revoked')) {
    return 'refresh_token_revoked'
  }

  if (haystack.includes('refresh_token_expired') || haystack.includes('expired')) {
    return 'refresh_token_expired'
  }

  return 'unknown'
}

function createTokenGrantError(params: {
  grantType: TokenGrantType
  status: number
  payload: OpenAIAuthTokenErrorPayload
  responseBody: string
}): OpenAIAuthTokenError {
  const detail = extractErrorStrings(params.payload, params.responseBody)[0]

  if (params.grantType === 'refresh_token') {
    const reason = classifyRefreshFailureReason(params.payload, params.responseBody)
    const message =
      reason === 'refresh_token_reused'
        ? 'The stored Codex refresh token was already used by another session.'
        : reason === 'refresh_token_expired'
          ? 'The stored Codex refresh token has expired.'
          : reason === 'refresh_token_revoked'
            ? 'The stored Codex refresh token was revoked.'
            : detail
              ? `Failed to refresh ChatGPT/Codex auth: ${detail}`
              : `Failed to refresh ChatGPT/Codex auth (${params.status}).`

    return new OpenAIAuthTokenError({
      message,
      reason,
      status: params.status,
      grantType: params.grantType,
      responseBody: params.responseBody,
    })
  }

  const message = detail
    ? `Sign-in could not be completed: ${detail}`
    : `Failed to exchange the ChatGPT/Codex authorization code (${params.status}).`

  return new OpenAIAuthTokenError({
    message,
    reason: 'unknown',
    status: params.status,
    grantType: params.grantType,
    responseBody: params.responseBody,
  })
}

async function requestOpenAIAuthTokens(
  body: URLSearchParams,
  params: {
    grantType: TokenGrantType
    env?: NodeJS.ProcessEnv
    fetchImpl?: FetchLike
  } = {},
): Promise<OpenAIAuthTokenResponse> {
  const fetchImpl = params.fetchImpl ?? fetch
  const response = await fetchImpl(getOpenAIAuthTokenUrl(params.env), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const responseBody = await response.text()
  let payload: OpenAIAuthTokenErrorPayload = null

  if (responseBody.trim().length > 0) {
    try {
      payload = JSON.parse(responseBody) as OpenAIAuthTokenErrorPayload
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw createTokenGrantError({
      grantType: params.grantType,
      status: response.status,
      payload,
      responseBody,
    })
  }

  const parsedPayload =
    payload && typeof payload === 'object'
      ? (payload as OpenAIAuthTokenResponse)
      : null

  if (
    !parsedPayload?.access_token ||
    (params.grantType === 'authorization_code' && !parsedPayload.id_token)
  ) {
    throw new Error(
      'ChatGPT/Codex login returned incomplete tokens. Please try again.',
    )
  }

  return parsedPayload
}

export async function exchangeOpenAIAuthCode(params: {
  authorizationCode: string
  codeVerifier: string
  port: number
  env?: NodeJS.ProcessEnv
  fetchImpl?: FetchLike
}): Promise<OpenAIAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.authorizationCode,
    redirect_uri: buildOpenAICallbackUrl(params.port),
    client_id: OPENAI_AUTH_CLIENT_ID,
    code_verifier: params.codeVerifier,
  })

  const payload = await requestOpenAIAuthTokens(body, {
    grantType: 'authorization_code',
    env: params.env,
    fetchImpl: params.fetchImpl,
  })

  logEvent('tengu_oauth_token_exchange_success', {})
  return payload
}

export async function refreshOpenAIAuthTokens(
  refreshToken: string,
  params: {
    env?: NodeJS.ProcessEnv
    fetchImpl?: FetchLike
  } = {},
): Promise<OpenAIAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OPENAI_AUTH_CLIENT_ID,
    scope: OPENAI_AUTH_SCOPES.join(' '),
  })

  return requestOpenAIAuthTokens(body, {
    grantType: 'refresh_token',
    env: params.env,
    fetchImpl: params.fetchImpl,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderCompletionPage(params: {
  title: string
  heading: string
  message: string
  tone: 'success' | 'error'
}): string {
  const accent = params.tone === 'success' ? '#0f766e' : '#b91c1c'
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #f7f8fb 0%, #ffffff 48%);
        color: #111827;
      }
      main {
        width: min(92vw, 34rem);
        padding: 2rem;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
        color: ${accent};
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(params.heading)}</h1>
      <p>${escapeHtml(params.message)}</p>
    </main>
  </body>
</html>`
}

function respondWithHtml(
  response: ServerResponse,
  html: string,
  statusCode = 200,
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
  })
  response.end(html)
}

export class OpenAIBrowserAuthService {
  private readonly codeVerifier = generateCodeVerifier()
  private authCodeListener: AuthCodeListener | null = null
  private port: number | null = null

  async startLoginFlow(
    onAuthUrl: (url: string) => Promise<void>,
    params: {
      env?: NodeJS.ProcessEnv
      fetchImpl?: FetchLike
    } = {},
  ): Promise<OpenAIBrowserLoginTokens> {
    logEvent('tengu_oauth_flow_start', {})

    this.authCodeListener = new AuthCodeListener(OPENAI_AUTH_CALLBACK_PATH)
    this.port = await startOpenAICallbackListener(
      this.authCodeListener,
      params.env,
    )

    const state = generateState()
    const authUrl = buildOpenAIAuthUrl({
      codeChallenge: generateCodeChallenge(this.codeVerifier),
      state,
      port: this.port,
      env: params.env,
    })

    const authorizationCode = await this.authCodeListener.waitForAuthorization(
      state,
      async () => {
        await onAuthUrl(authUrl)
        await openBrowser(authUrl)
      },
    )

    const isAutomaticFlow = this.authCodeListener.hasPendingResponse()

    try {
      const tokens = await exchangeOpenAIAuthCode({
        authorizationCode,
        codeVerifier: this.codeVerifier,
        port: this.port,
        env: params.env,
        fetchImpl: params.fetchImpl,
      })

      if (isAutomaticFlow) {
        this.authCodeListener.handleSuccessRedirect([], response => {
          respondWithHtml(
            response,
            renderCompletionPage({
              title: 'Klaudia Sign-in Complete',
              heading: 'Sign-in complete',
              message: 'Return to Klaudia to finish signing in.',
              tone: 'success',
            }),
          )
        })
      }

      logEvent('tengu_oauth_success', {})

      return {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        idToken: tokens.id_token!,
      }
    } catch (error) {
      logEvent('tengu_oauth_error', {})

      if (isAutomaticFlow) {
        const message =
          error instanceof Error
            ? error.message
            : 'Sign-in could not be completed.'

        this.authCodeListener.handleErrorRedirect(response => {
          respondWithHtml(
            response,
            renderCompletionPage({
              title: 'Klaudia Sign-in Error',
              heading: 'Sign-in failed',
              message,
              tone: 'error',
            }),
            400,
          )
        })
      }

      throw error
    } finally {
      this.cleanup()
    }
  }

  cleanup(): void {
    this.authCodeListener?.close()
    this.authCodeListener = null
  }
}
