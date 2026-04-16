import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  OpenAIAuthTokenError,
  refreshOpenAIAuthTokens,
  type FetchLike,
  type OpenAIAuthFailureReason,
  type OpenAIAuthSource,
} from '../services/openaiAuth/index.js'
import {
  normalizeProviderPlan,
  type ProviderPlan,
} from './providerSession.js'

const REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000

export type OpenAIAuthStorageMode =
  | 'file'
  | 'keyring'
  | 'auto'
  | 'ephemeral'

export type OpenAIAuthMode = 'chatgpt'

export type OpenAIIdTokenInfo = {
  email: string | null
  plan: ProviderPlan
  userId: string | null
  accountId: string | null
  rawJwt: string
}

export type OpenAIAuthTokens = {
  idToken: string
  accessToken: string
  refreshToken: string | null
  accountId: string | null
}

export type OpenAIAccountInfo = {
  email: string | null
  plan: ProviderPlan
  userId: string | null
  accountId: string | null
}

export type OpenAIAuthState = {
  authMode: OpenAIAuthMode
  authSource: OpenAIAuthSource
  storageMode: OpenAIAuthStorageMode
  tokens: OpenAIAuthTokens
  account: OpenAIAccountInfo
  lastRefresh: string | null
}

type AuthJsonShape = {
  auth_mode?: string | null
  auth_source?: string | null
  storage_mode?: string | null
  tokens?: {
    id_token?: string | { raw_jwt?: string | null } | null
    access_token?: string | null
    refresh_token?: string | null
    account_id?: string | null
  } | null
  last_refresh?: string | null
}

export type InteractiveOpenAIAuthStatus =
  | { status: 'ok' }
  | { status: 'missing' }
  | {
      status: 'relogin_required'
      authSource: OpenAIAuthSource
      reason: OpenAIAuthFailureReason
    }

const ephemeralState = new Map<string, OpenAIAuthState>()

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME || homedir()
}

export function resolveKlaudiaConfigHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.KLAUDIA_CONFIG_DIR || join(resolveHomeDir(env), '.klaudia')
}

export function resolveCodexHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.CODEX_HOME || join(resolveHomeDir(env), '.codex')
}

export function getOpenAIAuthFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveKlaudiaConfigHome(env), 'auth.json')
}

export function getCodexAuthFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveCodexHome(env), 'auth.json')
}

export function resolveOpenAIAuthStorageMode(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIAuthStorageMode {
  const rawMode =
    env.CLAUDE_CODE_AUTH_STORAGE_MODE || env.CODEX_AUTH_STORAGE_MODE || 'file'
  const normalized = rawMode.trim().toLowerCase()

  switch (normalized) {
    case 'file':
    case 'keyring':
    case 'auto':
    case 'ephemeral':
      return normalized
    default:
      return 'file'
  }
}

function getEphemeralKey(env: NodeJS.ProcessEnv): string {
  return createHash('sha256')
    .update(resolveKlaudiaConfigHome(env))
    .digest('hex')
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function decodeJwtSegment(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8')
}

export function parseChatGPTJwtClaims(rawJwt: string): OpenAIIdTokenInfo {
  const parts = rawJwt.split('.')
  if (parts.length < 2 || !parts[1]) {
    throw new Error('Invalid ChatGPT ID token format')
  }

  const payload = JSON.parse(decodeJwtSegment(parts[1]))
  const authClaims =
    payload['https://api.openai.com/auth'] &&
    typeof payload['https://api.openai.com/auth'] === 'object'
      ? payload['https://api.openai.com/auth']
      : {}
  const profileClaims =
    payload['https://api.openai.com/profile'] &&
    typeof payload['https://api.openai.com/profile'] === 'object'
      ? payload['https://api.openai.com/profile']
      : {}

  const email =
    coerceString(payload.email) || coerceString(profileClaims.email)
  const plan = normalizeProviderPlan(
    coerceString(authClaims.chatgpt_plan_type) ||
      coerceString(payload.chatgpt_plan_type),
  )
  const userId =
    coerceString(authClaims.chatgpt_user_id) ||
    coerceString(authClaims.user_id)
  const accountId =
    coerceString(authClaims.chatgpt_account_id) ||
    coerceString(payload.chatgpt_account_id)

  return {
    email,
    plan,
    userId,
    accountId,
    rawJwt,
  }
}

function normalizeAuthMode(rawMode: string | null | undefined): OpenAIAuthMode {
  if (rawMode?.trim().toLowerCase() === 'chatgpt') {
    return 'chatgpt'
  }

  return 'chatgpt'
}

function normalizeAuthSource(
  rawSource: string | null | undefined,
): OpenAIAuthSource {
  if (rawSource?.trim().toLowerCase() === 'browser') {
    return 'browser'
  }

  return 'codex-import'
}

function normalizeAuthState(
  raw: AuthJsonShape,
  storageMode: OpenAIAuthStorageMode,
): OpenAIAuthState | null {
  const accessToken = coerceString(raw.tokens?.access_token)
  const rawIdToken = raw.tokens?.id_token
  const idToken =
    typeof rawIdToken === 'string'
      ? coerceString(rawIdToken)
      : coerceString(rawIdToken?.raw_jwt)

  if (!accessToken || !idToken) {
    return null
  }

  const tokenInfo = parseChatGPTJwtClaims(idToken)
  const accountId =
    coerceString(raw.tokens?.account_id) || tokenInfo.accountId

  return {
    authMode: normalizeAuthMode(raw.auth_mode),
    authSource: normalizeAuthSource(raw.auth_source),
    storageMode,
    tokens: {
      idToken,
      accessToken,
      refreshToken: coerceString(raw.tokens?.refresh_token),
      accountId,
    },
    account: {
      email: tokenInfo.email,
      plan: tokenInfo.plan,
      userId: tokenInfo.userId,
      accountId,
    },
    lastRefresh: coerceString(raw.last_refresh),
  }
}

function readAuthJsonFile(filePath: string): OpenAIAuthState | null {
  if (!existsSync(filePath)) {
    return null
  }

  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as AuthJsonShape
  return normalizeAuthState(raw, 'file')
}

function serializeAuthState(state: OpenAIAuthState): string {
  return JSON.stringify(
    {
      auth_mode: state.authMode,
      auth_source: state.authSource,
      storage_mode: state.storageMode,
      tokens: {
        id_token: state.tokens.idToken,
        access_token: state.tokens.accessToken,
        refresh_token: state.tokens.refreshToken,
        account_id: state.tokens.accountId,
      },
      last_refresh: state.lastRefresh,
    },
    null,
    2,
  )
}

export function readOpenAIAuthState(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIAuthState | null {
  const storageMode = resolveOpenAIAuthStorageMode(env)
  if (storageMode === 'ephemeral') {
    return ephemeralState.get(getEphemeralKey(env)) ?? null
  }

  const fromDisk = readAuthJsonFile(getOpenAIAuthFilePath(env))
  if (!fromDisk) {
    return null
  }

  return {
    ...fromDisk,
    storageMode,
  }
}

export function writeOpenAIAuthState(
  state: OpenAIAuthState,
  env: NodeJS.ProcessEnv = process.env,
): OpenAIAuthState {
  const storageMode = resolveOpenAIAuthStorageMode(env)
  const normalizedState = {
    ...state,
    storageMode,
  }

  if (storageMode === 'ephemeral') {
    ephemeralState.set(getEphemeralKey(env), normalizedState)
    return normalizedState
  }

  const filePath = getOpenAIAuthFilePath(env)
  ensureParentDir(filePath)
  writeFileSync(filePath, serializeAuthState(normalizedState), {
    mode: 0o600,
  })
  return normalizedState
}

export function deleteOpenAIAuthState(
  env: NodeJS.ProcessEnv = process.env,
): void {
  ephemeralState.delete(getEphemeralKey(env))
  rmSync(getOpenAIAuthFilePath(env), { force: true })
}

export function importCodexAuthState(
  env: NodeJS.ProcessEnv = process.env,
  codexAuthPath = getCodexAuthFilePath(env),
): OpenAIAuthState {
  const state = readAuthJsonFile(codexAuthPath)
  if (!state) {
    throw new Error(
      `No Codex subscription auth found at ${codexAuthPath}. Sign in with Codex first.`,
    )
  }

  return writeOpenAIAuthState(
    {
      ...state,
      authSource: 'codex-import',
      storageMode: resolveOpenAIAuthStorageMode(env),
    },
    env,
  )
}

export function toLegacyOAuthTokens(
  state: OpenAIAuthState | null,
): {
  accessToken: string
  refreshToken: string | null
  expiresAt: null
  scopes: string[]
  subscriptionType: string | null
  rateLimitTier: null
} | null {
  if (!state) {
    return null
  }

  return {
    accessToken: state.tokens.accessToken,
    refreshToken: state.tokens.refreshToken,
    expiresAt: null,
    scopes: ['openid', 'profile', 'email'],
    subscriptionType:
      state.account.plan === 'unknown' ? null : state.account.plan,
    rateLimitTier: null,
  }
}

export function shouldRefreshOpenAIAuthState(
  state: OpenAIAuthState | null,
  now = Date.now(),
): boolean {
  if (!state?.tokens.refreshToken) {
    return false
  }

  if (!state.lastRefresh) {
    return true
  }

  const lastRefresh = Date.parse(state.lastRefresh)
  if (!Number.isFinite(lastRefresh)) {
    return true
  }

  return now - lastRefresh >= REFRESH_INTERVAL_MS
}

export async function getInteractiveOpenAIAuthStatus(
  env: NodeJS.ProcessEnv = process.env,
  opts: {
    fetchImpl?: FetchLike
  } = {},
): Promise<InteractiveOpenAIAuthStatus> {
  const current = readOpenAIAuthState(env)
  if (!current) {
    return { status: 'missing' }
  }

  try {
    const refreshed = await refreshOpenAIAuthStateIfNeeded(env, {
      ...opts,
      force: true,
    })
    return refreshed ? { status: 'ok' } : { status: 'missing' }
  } catch (error) {
    return {
      status: 'relogin_required',
      authSource: current.authSource,
      reason:
        error instanceof OpenAIAuthTokenError ? error.reason : 'unknown',
    }
  }
}

export async function refreshOpenAIAuthStateIfNeeded(
  env: NodeJS.ProcessEnv = process.env,
  opts: {
    fetchImpl?: FetchLike
    force?: boolean
  } = {},
): Promise<OpenAIAuthState | null> {
  const current = readOpenAIAuthState(env)
  if (!current) {
    return null
  }

  if (!opts.force && !shouldRefreshOpenAIAuthState(current)) {
    return current
  }

  if (!current.tokens.refreshToken) {
    return current
  }

  const payload = await refreshOpenAIAuthTokens(current.tokens.refreshToken, {
    env,
    fetchImpl: opts.fetchImpl,
  })
  const nextIdToken = payload.id_token || current.tokens.idToken
  const tokenInfo = parseChatGPTJwtClaims(nextIdToken)
  const refreshedState: OpenAIAuthState = {
    authMode: 'chatgpt',
    authSource: current.authSource,
    storageMode: resolveOpenAIAuthStorageMode(env),
    tokens: {
      idToken: nextIdToken,
      accessToken: payload.access_token || current.tokens.accessToken,
      refreshToken: payload.refresh_token || current.tokens.refreshToken,
      accountId:
        current.tokens.accountId ||
        tokenInfo.accountId ||
        current.account.accountId,
    },
    account: {
      email: tokenInfo.email,
      plan: tokenInfo.plan,
      userId: tokenInfo.userId,
      accountId:
        current.tokens.accountId ||
        tokenInfo.accountId ||
        current.account.accountId,
    },
    lastRefresh: new Date().toISOString(),
  }

  return writeOpenAIAuthState(refreshedState, env)
}
