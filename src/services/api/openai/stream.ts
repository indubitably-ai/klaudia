export type ResponsesStreamPayload = {
  type: string
  item?: Record<string, any>
  response?: Record<string, any>
  delta?: string
}

export type StreamEnvelope = {
  type: 'stream_event'
  event: Record<string, any>
  ttftMs?: number
}

export type StreamCompletion = {
  contentBlocks: Array<Record<string, any>>
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  responseId: string | null
}

type StreamState = {
  startedAt: number
  started: boolean
  textIndex: number | null
  textValue: string
  contentBlocks: Array<Record<string, any>>
  usage: StreamCompletion['usage']
  responseId: string | null
}

function createEmptyUsage(): StreamCompletion['usage'] {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
}

export function createResponsesStreamState(
  startedAt = Date.now(),
): StreamState {
  return {
    startedAt,
    started: false,
    textIndex: null,
    textValue: '',
    contentBlocks: [],
    usage: createEmptyUsage(),
    responseId: null,
  }
}

function ensureMessageStart(state: StreamState, output: StreamEnvelope[]): void {
  if (state.started) {
    return
  }

  state.started = true
  output.push({
    type: 'stream_event',
    event: {
      type: 'message_start',
      message: {
        type: 'message',
        role: 'assistant',
        content: [],
        usage: createEmptyUsage(),
      },
    },
    ttftMs: Math.max(0, Date.now() - state.startedAt),
  })
}

function ensureTextBlock(state: StreamState, output: StreamEnvelope[]): number {
  if (state.textIndex !== null) {
    return state.textIndex
  }

  ensureMessageStart(state, output)
  state.textIndex = state.contentBlocks.length
  state.contentBlocks.push({
    type: 'text',
    text: '',
  })
  output.push({
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index: state.textIndex,
      content_block: {
        type: 'text',
        text: '',
      },
    },
  })

  return state.textIndex
}

function appendTextDelta(
  state: StreamState,
  output: StreamEnvelope[],
  delta: string,
): void {
  if (delta.length === 0) {
    return
  }

  const index = ensureTextBlock(state, output)
  state.textValue += delta
  state.contentBlocks[index] = {
    type: 'text',
    text: state.textValue,
  }
  output.push({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'text_delta',
        text: delta,
      },
    },
  })
}

function closeOpenTextBlock(
  state: StreamState,
  output: StreamEnvelope[],
): void {
  if (state.textIndex === null) {
    return
  }

  output.push({
    type: 'stream_event',
    event: {
      type: 'content_block_stop',
      index: state.textIndex,
    },
  })
  state.textIndex = null
}

function normalizeUsage(response: Record<string, any> | undefined): StreamCompletion['usage'] {
  const usage = response?.usage
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_creation_input_tokens:
      usage?.input_tokens_details?.cached_tokens ?? 0,
    cache_read_input_tokens: 0,
  }
}

function addFunctionCall(
  state: StreamState,
  output: StreamEnvelope[],
  item: Record<string, any>,
): void {
  closeOpenTextBlock(state, output)
  ensureMessageStart(state, output)

  const index = state.contentBlocks.length
  const argumentsText =
    typeof item.arguments === 'string'
      ? item.arguments
      : JSON.stringify(item.arguments ?? {})
  const contentBlock = {
    type: 'tool_use',
    id: item.call_id,
    name: item.name,
    input:
      typeof item.arguments === 'string'
        ? item.arguments
        : item.arguments ?? {},
  }

  state.contentBlocks.push(contentBlock)
  output.push({
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index,
      content_block: contentBlock,
    },
  })
  if (argumentsText.length > 0) {
    output.push({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: argumentsText,
        },
      },
    })
  }
  output.push({
    type: 'stream_event',
    event: {
      type: 'content_block_stop',
      index,
    },
  })
}

function addMessageItem(
  state: StreamState,
  output: StreamEnvelope[],
  item: Record<string, any>,
): void {
  const content = Array.isArray(item.content) ? item.content : []
  for (const part of content) {
    if (part.type === 'output_text' && typeof part.text === 'string') {
      if (part.text === state.textValue) {
        continue
      }

      if (part.text.startsWith(state.textValue)) {
        appendTextDelta(
          state,
          output,
          part.text.slice(state.textValue.length),
        )
        continue
      }

      if (state.textValue.startsWith(part.text)) {
        continue
      }
    }
  }
}

export function applyResponsesStreamEvent(
  state: StreamState,
  payload: ResponsesStreamPayload,
): {
  events: StreamEnvelope[]
  completed?: StreamCompletion
} {
  const events: StreamEnvelope[] = []

  switch (payload.type) {
    case 'response.output_text.delta': {
      const delta = payload.delta ?? ''
      appendTextDelta(state, events, delta)
      break
    }
    case 'response.output_item.done': {
      const item = payload.item
      if (item?.type === 'message' && item.role === 'assistant') {
        addMessageItem(state, events, item)
      } else if (item?.type === 'function_call') {
        addFunctionCall(state, events, item)
      }
      break
    }
    case 'response.output_item.added':
      // Wait for the corresponding *.done snapshot before materializing
      // message/function-call blocks. The added event can carry incomplete
      // tool arguments, which leads to premature tool execution in headless mode.
      break
    case 'response.completed': {
      closeOpenTextBlock(state, events)
      state.responseId =
        typeof payload.response?.id === 'string' ? payload.response.id : null
      state.usage = normalizeUsage(payload.response)
      events.push({
        type: 'stream_event',
        event: {
          type: 'message_stop',
        },
      })
      return {
        events,
        completed: {
          contentBlocks: state.contentBlocks,
          usage: state.usage,
          responseId: state.responseId,
        },
      }
    }
  }

  return { events }
}

export async function* parseSSEStream(
  stream: AsyncIterable<string>,
): AsyncGenerator<ResponsesStreamPayload> {
  let buffer = ''

  const parseEvent = (
    rawEvent: string,
  ): ResponsesStreamPayload | null => {
    const data = rawEvent
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n')

    if (!data) {
      return null
    }

    return JSON.parse(data) as ResponsesStreamPayload
  }

  for await (const chunk of stream) {
    buffer += chunk

    while (true) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary === -1) {
        break
      }

      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      const payload = parseEvent(rawEvent)
      if (payload) {
        yield payload
      }
    }
  }

  const trailingEvent = buffer.trim()
  if (!trailingEvent) {
    return
  }

  const payload = parseEvent(trailingEvent)
  if (payload) {
    yield payload
  }
}
