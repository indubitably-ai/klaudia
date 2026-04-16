import {
  mapAppModelToProviderModel,
  type ModelCatalog,
} from 'src/provider/providerRegistry.js'

export type ToolSchema = {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
  strict?: boolean
}

export type ResponsesToolChoice =
  | 'auto'
  | 'none'
  | {
      name: string
    }

export type ResponsesRequestInput = {
  model: string
  modelCatalog?: ModelCatalog
  systemPrompt: readonly string[]
  messages: Array<Record<string, any>>
  tools?: ToolSchema[]
  toolChoice?: ResponsesToolChoice
  outputSchema?: Record<string, unknown> | null
  reasoningEffort?: string | null
  verbosity?: 'low' | 'medium' | 'high' | null
  parallelToolCalls?: boolean
  store?: boolean
  stream?: boolean
}

type ResponsesMessageItem =
  | {
      type: 'message'
      role: 'user' | 'assistant'
      content: Array<Record<string, unknown>>
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }

function toTextContent(block: Record<string, any>): string | null {
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? block.text : ''
    case 'thinking':
    case 'redacted_thinking':
      return null
    case 'document':
      return `[document${block.title ? `:${block.title}` : ''}]`
    case 'image':
      return '[image]'
    default:
      return block.type ? `[${block.type}]` : null
  }
}

function toInputImage(block: Record<string, any>): Record<string, unknown> | null {
  const source = block.source
  if (source?.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'input_image',
      image_url: `data:${source.media_type};base64,${source.data}`,
    }
  }

  if (source?.type === 'url' && source.url) {
    return {
      type: 'input_image',
      image_url: source.url,
    }
  }

  return null
}

function toInputFile(block: Record<string, any>): Record<string, unknown> | null {
  const source = block.source
  if (source?.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'input_file',
      filename: block.title || 'attachment',
      file_data: `data:${source.media_type};base64,${source.data}`,
    }
  }

  if (source?.type === 'url' && source.url) {
    return {
      type: 'input_file',
      filename: block.title || 'attachment',
      file_url: source.url,
    }
  }

  return null
}

function stringifyFunctionOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function collectMessageItems(message: Record<string, any>): ResponsesMessageItem[] {
  const content = Array.isArray(message.message?.content)
    ? message.message.content
    : typeof message.message?.content === 'string'
      ? [{ type: 'text', text: message.message.content }]
      : []
  const role = message.type === 'assistant' ? 'assistant' : 'user'
  const messageContent: Array<Record<string, unknown>> = []
  const items: ResponsesMessageItem[] = []

  for (const block of content) {
    if (block.type === 'tool_result') {
      items.push({
        type: 'function_call_output',
        call_id: block.tool_use_id,
        output: stringifyFunctionOutput(block.content),
      })
      continue
    }

    if (block.type === 'tool_use') {
      items.push({
        type: 'function_call',
        call_id: block.id,
        name: block.name,
        arguments:
          typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input ?? {}),
      })
      continue
    }

    if (block.type === 'image') {
      const image = toInputImage(block)
      if (image) {
        messageContent.push(image)
      }
      continue
    }

    if (block.type === 'document') {
      const file = toInputFile(block)
      if (file) {
        messageContent.push(file)
      }
      continue
    }

    const text = toTextContent(block)
    if (text === null) {
      continue
    }

    messageContent.push({
      type: role === 'assistant' ? 'output_text' : 'input_text',
      text,
    })
  }

  if (messageContent.length > 0) {
    items.unshift({
      type: 'message',
      role,
      content: messageContent,
    })
  }

  return items
}

function mapTools(tools: ToolSchema[]): Array<Record<string, unknown>> {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema ?? {
      type: 'object',
      additionalProperties: true,
    },
    strict: tool.strict === true,
  }))
}

function mapToolChoice(
  toolChoice: ResponsesToolChoice | undefined,
): string | Record<string, string> {
  if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none') {
    return toolChoice ?? 'auto'
  }

  return {
    type: 'function',
    name: toolChoice.name,
  }
}

function mapReasoningEffort(
  effort: string | null | undefined,
): { effort: 'low' | 'medium' | 'high' } | undefined {
  const normalized = effort?.trim().toLowerCase()

  switch (normalized) {
    case 'low':
      return { effort: 'low' }
    case 'high':
    case 'xhigh':
      return { effort: 'high' }
    case 'medium':
    default:
      return normalized ? { effort: 'medium' } : undefined
  }
}

function mapTextControls(input: ResponsesRequestInput): Record<string, unknown> | undefined {
  const text: Record<string, unknown> = {}

  if (input.verbosity) {
    text.verbosity = input.verbosity
  }

  if (input.outputSchema) {
    text.format = {
      type: 'json_schema',
      strict: true,
      name: 'klaudia_output_schema',
      schema: input.outputSchema,
    }
  }

  return Object.keys(text).length > 0 ? text : undefined
}

export function buildResponsesRequest(input: ResponsesRequestInput): Record<string, unknown> {
  const requestInput = input.messages.flatMap(message => collectMessageItems(message))

  return {
    model: mapAppModelToProviderModel(input.model),
    instructions: input.systemPrompt.join('\n\n'),
    input: requestInput,
    tools: mapTools(input.tools ?? []),
    tool_choice: mapToolChoice(input.toolChoice),
    parallel_tool_calls: input.parallelToolCalls ?? true,
    reasoning: mapReasoningEffort(input.reasoningEffort),
    store: input.store ?? false,
    stream: input.stream ?? true,
    include: [],
    text: mapTextControls(input),
  }
}
