import { randomUUID } from 'crypto'
import type { OpenAIAuthState } from 'src/provider/openaiAuthManager.js'
import {
  getActiveProviderConfig,
  getUnsupportedLegacyProviderEnv,
  type ProviderConfig,
} from 'src/provider/providerRegistry.js'

export type OpenAIFetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export function getUnsupportedOpenAIRuntimeError(
  env: NodeJS.ProcessEnv,
): Error | null {
  const unsupported = getUnsupportedLegacyProviderEnv(env)
  if (unsupported.length === 0) {
    return null
  }

  return new Error(
    `Unsupported legacy provider environment detected: ${unsupported.join(', ')}. Remove Anthropic/Bedrock/Vertex/Foundry env vars and use Codex subscription auth instead.`,
  )
}

export function createOpenAIRequestId(): string {
  return randomUUID()
}

export function buildOpenAIRequestHeaders(
  provider: ProviderConfig,
  auth: OpenAIAuthState,
  requestId: string,
  options: {
    accept?: string
    contentType?: string
    ifNoneMatch?: string | null
  } = {},
): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.tokens.accessToken}`,
    'ChatGPT-Account-ID':
      auth.tokens.accountId || auth.account.accountId || '',
    ...(options.accept ? { Accept: options.accept } : {}),
    ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    ...(options.ifNoneMatch ? { 'If-None-Match': options.ifNoneMatch } : {}),
    'X-Client-Request-Id': requestId,
    ...provider.headers,
  }
}

export function getOpenAIResponseRequestId(response: Response): string | null {
  return (
    response.headers.get('x-request-id') ||
    response.headers.get('request-id') ||
    response.headers.get('openai-request-id') ||
    null
  )
}

export function getOpenAIResponseEtag(response: Response): string | null {
  return response.headers.get('etag')
}

export async function readOpenAIResponseError(
  response: Response,
  label = 'request',
): Promise<Error> {
  const body = await response.text()
  return new Error(
    `OpenAI ${label} failed (${response.status}): ${body || response.statusText}`.trim(),
  )
}

export function resolveOpenAITransportContext(
  env: NodeJS.ProcessEnv = process.env,
  provider?: ProviderConfig,
  fetchImpl?: OpenAIFetchLike,
): {
  env: NodeJS.ProcessEnv
  provider: ProviderConfig
  fetchImpl: OpenAIFetchLike
} {
  return {
    env,
    provider: provider ?? getActiveProviderConfig(env),
    fetchImpl: fetchImpl ?? fetch,
  }
}
