import type { OpenAIAuthState } from 'src/provider/openaiAuthManager.js'
import {
  getActiveProviderConfig,
  type ProviderConfig,
} from 'src/provider/providerRegistry.js'
import { sleep } from 'src/utils/sleep.js'
import {
  applyResponsesStreamEvent,
  createResponsesStreamState,
  parseSSEStream,
  type StreamCompletion,
  type StreamEnvelope,
} from './stream.js'
import {
  buildOpenAIRequestHeaders,
  createOpenAIRequestId,
  getOpenAIResponseRequestId,
  getUnsupportedOpenAIRuntimeError,
  type OpenAIFetchLike,
} from './http.js'

export type TransportResult = StreamCompletion & {
  requestId: string | null
}

export type TransportEnvelope =
  | StreamEnvelope
  | {
      type: 'completed'
      completion: TransportResult
    }

type TransportOptions = {
  request: Record<string, unknown>
  auth: OpenAIAuthState
  env?: NodeJS.ProcessEnv
  provider?: ProviderConfig
  fetchImpl?: OpenAIFetchLike
  signal?: AbortSignal
}

export class OpenAITransportError extends Error {
  readonly status: number | null
  readonly requestId: string | null
  readonly body: string | null
  readonly kind: 'http' | 'transport'
  override cause?: unknown

  constructor({
    status,
    requestId,
    body,
    kind,
    cause,
  }: {
    status: number | null
    requestId: string | null
    body: string | null
    kind: 'http' | 'transport'
    cause?: unknown
  }) {
    super(buildTransportErrorMessage(status, body, cause))
    this.name = 'OpenAITransportError'
    this.status = status
    this.requestId = requestId
    this.body = body
    this.kind = kind
    this.cause = cause
  }
}

function buildTransportErrorMessage(
  status: number | null,
  body: string | null,
  cause?: unknown,
): string {
  if (status !== null) {
    return `OpenAI Responses request failed (${status}): ${body || 'Unknown error'}`.trim()
  }

  if (body && body.trim().length > 0) {
    return `OpenAI Responses request failed: ${body}`.trim()
  }

  if (cause instanceof Error && cause.message.trim().length > 0) {
    return `OpenAI Responses request failed: ${cause.message}`.trim()
  }

  return 'OpenAI Responses request failed'
}

async function readResponseError(response: Response): Promise<OpenAITransportError> {
  const body = await response.text()
  return new OpenAITransportError({
    status: response.status,
    requestId: getOpenAIResponseRequestId(response),
    body: body || response.statusText,
    kind: 'http',
  })
}

function createTransportFailureError(error: unknown): OpenAITransportError {
  if (error instanceof OpenAITransportError) {
    return error
  }

  return new OpenAITransportError({
    status: null,
    requestId: null,
    body: error instanceof Error ? error.message : String(error),
    kind: 'transport',
    cause: error,
  })
}

function shouldRetryStatusError(
  error: OpenAITransportError,
  provider: ProviderConfig,
  attempt: number,
): boolean {
  return (
    error.status !== null &&
    error.status >= 500 &&
    provider.retry.retry5xx &&
    attempt < Math.max(1, provider.retry.maxAttempts)
  )
}

function shouldRetryTransportError(
  error: OpenAITransportError,
  provider: ProviderConfig,
  attempt: number,
): boolean {
  return (
    error.kind === 'transport' &&
    provider.retry.retryTransport &&
    attempt < Math.max(1, provider.retry.maxAttempts)
  )
}

async function waitForRetry(
  provider: ProviderConfig,
  attempt: number,
  signal?: AbortSignal,
): Promise<void> {
  const delayMs = provider.retry.baseDelayMs * 2 ** (attempt - 1)
  await sleep(delayMs, signal, {
    throwOnAbort: true,
  })
}

async function requestResponses(
  options: TransportOptions & {
    provider: ProviderConfig
    fetchImpl: OpenAIFetchLike
    request: Record<string, unknown>
    stream: boolean
  },
): Promise<Response> {
  const requestId = createOpenAIRequestId()
  const maxAttempts = Math.max(1, options.provider.retry.maxAttempts)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw new Error('Request was aborted.')
    }

    let response: Response
    try {
      response = await options.fetchImpl(
        `${options.provider.baseUrl}/responses`,
        {
          method: 'POST',
          headers: buildOpenAIRequestHeaders(
            options.provider,
            options.auth,
            requestId,
            {
              accept: options.stream ? 'text/event-stream' : undefined,
              contentType: 'application/json',
            },
          ),
          body: JSON.stringify(options.request),
          signal: options.signal,
        },
      )
    } catch (error) {
      if (options.signal?.aborted) {
        throw error
      }

      const transportError = createTransportFailureError(error)
      if (shouldRetryTransportError(transportError, options.provider, attempt)) {
        await waitForRetry(options.provider, attempt, options.signal)
        continue
      }

      throw transportError
    }

    if (!response.ok) {
      const statusError = await readResponseError(response)
      if (shouldRetryStatusError(statusError, options.provider, attempt)) {
        await waitForRetry(options.provider, attempt, options.signal)
        continue
      }

      throw statusError
    }

    return response
  }

  throw new Error('OpenAI Responses request failed: retry attempts exhausted')
}

async function* responseBodyChunks(
  response: Response,
): AsyncGenerator<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return
  }

  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value) {
      yield decoder.decode(value, { stream: true })
    }
  }

  const tail = decoder.decode()
  if (tail) {
    yield tail
  }
}

function normalizeCompletionFromJson(
  payload: Record<string, any>,
  requestId: string | null,
): TransportResult {
  const contentBlocks: Array<Record<string, any>> = []
  const output = Array.isArray(payload.output) ? payload.output : []

  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content?.type === 'output_text' && typeof content.text === 'string') {
          contentBlocks.push({
            type: 'text',
            text: content.text,
          })
        }
      }
    } else if (item?.type === 'function_call') {
      contentBlocks.push({
        type: 'tool_use',
        id: item.call_id,
        name: item.name,
        input:
          typeof item.arguments === 'string'
            ? item.arguments
            : item.arguments ?? {},
      })
    }
  }

  return {
    contentBlocks,
    usage: {
      input_tokens: payload.usage?.input_tokens ?? 0,
      output_tokens: payload.usage?.output_tokens ?? 0,
      cache_creation_input_tokens:
        payload.usage?.input_tokens_details?.cached_tokens ?? 0,
      cache_read_input_tokens: 0,
    },
    responseId: typeof payload.id === 'string' ? payload.id : null,
    requestId,
  }
}

export async function createResponse(
  options: TransportOptions,
): Promise<TransportResult> {
  const env = options.env ?? process.env
  const unsupported = getUnsupportedOpenAIRuntimeError(env)
  if (unsupported) {
    throw unsupported
  }

  const provider = options.provider ?? getActiveProviderConfig(env)
  const fetchImpl = options.fetchImpl ?? fetch
  const request = {
    ...options.request,
    stream: false,
  }
  const response = await requestResponses({
    ...options,
    request,
    provider,
    fetchImpl,
    stream: false,
  })

  const payload = (await response.json()) as Record<string, any>
  return normalizeCompletionFromJson(
    payload,
    getOpenAIResponseRequestId(response),
  )
}

export async function* streamResponse(
  options: TransportOptions,
): AsyncGenerator<TransportEnvelope, void> {
  const env = options.env ?? process.env
  const unsupported = getUnsupportedOpenAIRuntimeError(env)
  if (unsupported) {
    throw unsupported
  }

  const provider = options.provider ?? getActiveProviderConfig(env)
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await requestResponses({
    ...options,
    provider,
    fetchImpl,
    stream: true,
  })

  const responseRequestId = getOpenAIResponseRequestId(response)
  const state = createResponsesStreamState()
  for await (const payload of parseSSEStream(responseBodyChunks(response))) {
    const result = applyResponsesStreamEvent(state, payload)
    for (const event of result.events) {
      yield event
    }
    if (result.completed) {
      yield {
        type: 'completed',
        completion: {
          ...result.completed,
          requestId: responseRequestId,
        },
      }
      return
    }
  }

  throw new Error('OpenAI Responses stream closed before completion')
}
