import { APIUserAbortError } from '@anthropic-ai/sdk/error'
import {
  type OpenAIAuthState,
  readOpenAIAuthState,
  refreshOpenAIAuthStateIfNeeded,
} from 'src/provider/openaiAuthManager.js'
import { getUnsupportedLegacyProviderEnv } from 'src/provider/providerRegistry.js'
import {
  getOpenAIAuthMissingAssistantMessage,
  getOpenAIAuthRecoveryCopy,
} from 'src/services/openaiAuth/messages.js'
import { OpenAIAuthTokenError } from 'src/services/openaiAuth/index.js'
import type { Tool } from 'src/Tool.js'
import {
  toolToAPISchema,
  type CacheScope,
} from 'src/utils/api.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
} from 'src/utils/messages.js'
import {
  OpenAITransportError,
  streamResponse,
} from './transport.js'
import { buildResponsesRequest } from './request.js'

type QueryArgs = {
  messages: Array<Record<string, any>>
  systemPrompt: readonly string[]
  tools: Tool[]
  signal: AbortSignal
  options: Record<string, any>
}

function getOutputSchema(outputFormat: Record<string, any> | undefined): Record<string, unknown> | null {
  if (!outputFormat || typeof outputFormat !== 'object') {
    return null
  }

  return (
    outputFormat.schema ||
    outputFormat.json_schema?.schema ||
    outputFormat.input_schema ||
    null
  )
}

function getToolChoice(toolChoice: Record<string, any> | undefined):
  | 'auto'
  | 'none'
  | { name: string } {
  if (!toolChoice || toolChoice.type === 'auto') {
    return 'auto'
  }

  if (toolChoice.type === 'none') {
    return 'none'
  }

  if (toolChoice.type === 'tool' && typeof toolChoice.name === 'string') {
    return { name: toolChoice.name }
  }

  return 'auto'
}

function createUsage(usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}) {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    server_tool_use: {
      web_search_requests: 0,
      web_fetch_requests: 0,
    },
    service_tier: null,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
    inference_geo: null,
    iterations: null,
    speed: null,
  }
}

async function buildToolSchemas(args: QueryArgs) {
  const schemas = []

  for (const tool of args.tools) {
    const schema = await toolToAPISchema(tool, {
      getToolPermissionContext: args.options.getToolPermissionContext,
      tools: args.tools,
      agents: args.options.agents ?? [],
      allowedAgentTypes: args.options.allowedAgentTypes,
      model: args.options.model,
      deferLoading: false,
      cacheControl: undefined as
        | {
            type: 'ephemeral'
            scope?: CacheScope | undefined
            ttl?: '5m' | '1h' | undefined
          }
        | undefined,
    })

    schemas.push({
      name: schema.name,
      description: schema.description,
      input_schema: schema.input_schema,
      strict: schema.strict,
    })
  }

  for (const extraSchema of args.options.extraToolSchemas ?? []) {
    if (extraSchema?.name) {
      schemas.push({
        name: extraSchema.name,
        description: extraSchema.description,
        input_schema: extraSchema.input_schema,
        strict: extraSchema.strict,
      })
    }
  }

  return schemas
}

function getMissingAuthMessage(): ReturnType<typeof createAssistantAPIErrorMessage> {
  return createAssistantAPIErrorMessage({
    content: getOpenAIAuthMissingAssistantMessage(),
    apiError: 'invalid_api_key',
    error: 'invalid_api_key',
  })
}

function getRefreshFailureMessage(
  authState: OpenAIAuthState,
  error: OpenAIAuthTokenError,
): ReturnType<typeof createAssistantAPIErrorMessage> {
  return createAssistantAPIErrorMessage({
    content: getOpenAIAuthRecoveryCopy(authState.authSource, error.reason)
      .assistantMessage,
    apiError: 'invalid_api_key',
    error: 'invalid_api_key',
  })
}

function getUnsupportedEnvMessage(
  unsupported: string[],
): ReturnType<typeof createAssistantAPIErrorMessage> {
  return createAssistantAPIErrorMessage({
    content:
      `Unsupported provider environment detected: ${unsupported.join(', ')}. ` +
      'Remove Anthropic or cloud-provider env vars and use the Codex subscription runtime instead.',
    apiError: 'invalid_request_error',
    error: 'invalid_api_key',
  })
}

function classifyTransportError(error: OpenAITransportError): {
  apiError: string
  error: 'server_error' | 'authentication_failed' | 'invalid_request'
} {
  if (error.status === 401 || error.status === 403) {
    return {
      apiError: 'invalid_api_key',
      error: 'authentication_failed',
    }
  }

  if (error.status !== null && error.status >= 400 && error.status < 500) {
    return {
      apiError: 'invalid_request_error',
      error: 'invalid_request',
    }
  }

  return {
    apiError: 'server_error',
    error: 'server_error',
  }
}

export async function queryModelWithoutStreamingOpenAI(
  args: QueryArgs,
) {
  let assistantMessage
  for await (const message of queryModelWithStreamingOpenAI(args)) {
    if (message.type === 'assistant') {
      assistantMessage = message
    }
  }

  if (!assistantMessage) {
    if (args.signal.aborted) {
      throw new APIUserAbortError()
    }
    throw new Error('No assistant message returned from the OpenAI transport')
  }

  return assistantMessage
}

export async function* queryModelWithStreamingOpenAI(
  args: QueryArgs,
): AsyncGenerator<any, void> {
  if (args.signal.aborted) {
    throw new APIUserAbortError()
  }

  const unsupported = getUnsupportedLegacyProviderEnv()
  if (unsupported.length > 0) {
    yield getUnsupportedEnvMessage(unsupported)
    return
  }

  try {
    const auth = await refreshOpenAIAuthStateIfNeeded(process.env, {
      fetchImpl: args.options.fetchOverride,
    })
    if (!auth?.tokens.accessToken) {
      yield getMissingAuthMessage()
      return
    }

    const normalizedMessages = normalizeMessagesForAPI(args.messages, args.tools)
    const toolSchemas = await buildToolSchemas(args)
    const request = buildResponsesRequest({
      model: args.options.model,
      systemPrompt: args.systemPrompt,
      messages: normalizedMessages,
      tools: toolSchemas,
      toolChoice: getToolChoice(args.options.toolChoice),
      outputSchema: getOutputSchema(args.options.outputFormat),
      reasoningEffort: args.options.effortValue,
      verbosity: 'medium',
      parallelToolCalls: true,
      store: false,
      stream: true,
    })

    for await (const envelope of streamResponse({
      request,
      auth,
      fetchImpl: args.options.fetchOverride,
      signal: args.signal,
    })) {
      if (envelope.type === 'stream_event') {
        yield envelope
        continue
      }

      const assistant = createAssistantMessage({
        content: normalizeContentFromAPI(
          envelope.completion.contentBlocks as any,
          args.tools,
          args.options.agentId,
        ),
        usage: createUsage(envelope.completion.usage),
      })
      assistant.requestId = envelope.completion.requestId ?? undefined
      yield assistant
    }
  } catch (error) {
    if (args.signal.aborted) {
      throw new APIUserAbortError()
    }

    if (error instanceof OpenAIAuthTokenError) {
      const authState = readOpenAIAuthState()
      yield authState
        ? getRefreshFailureMessage(authState, error)
        : getMissingAuthMessage()
      return
    }

    const classification =
      error instanceof OpenAITransportError
        ? classifyTransportError(error)
        : {
            apiError: 'unknown_error',
            error: 'unknown' as const,
          }

    yield createAssistantAPIErrorMessage({
      content: `API Error: ${error instanceof Error ? error.message : String(error)}`,
      apiError: classification.apiError as never,
      error: classification.error,
      errorDetails: error instanceof Error ? error.stack : String(error),
    })
  }
}
