import { describe, expect, it } from 'bun:test'
import {
  applyResponsesStreamEvent,
  createResponsesStreamState,
  parseSSEStream,
} from 'src/services/api/openai/stream.js'

describe('openai responses stream adapter', () => {
  it('translates Responses SSE payloads into internal stream events and a final assistant payload', async () => {
    const fixture = [
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" world"}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_123","name":"list_files","arguments":"{\\"cwd\\":\\"/repo\\"}"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_123","usage":{"input_tokens":12,"output_tokens":34,"input_tokens_details":{"cached_tokens":2}}}}\n\n',
    ]

    async function* streamChunks(): AsyncGenerator<string> {
      for (const chunk of fixture) {
        yield chunk
      }
    }

    const state = createResponsesStreamState(0)
    const output = []

    for await (const payload of parseSSEStream(streamChunks())) {
      const result = applyResponsesStreamEvent(state, payload)
      output.push(...result.events)
      if (result.completed) {
        expect(result.completed).toEqual({
          contentBlocks: [
            { type: 'text', text: 'Hello world' },
            {
              type: 'tool_use',
              id: 'call_123',
              name: 'list_files',
              input: '{"cwd":"/repo"}',
            },
          ],
          usage: {
            input_tokens: 12,
            output_tokens: 34,
            cache_creation_input_tokens: 2,
            cache_read_input_tokens: 0,
          },
          responseId: 'resp_123',
        })
      }
    }

    expect(output).toEqual([
      {
        type: 'stream_event',
        event: {
          type: 'message_start',
          message: {
            type: 'message',
            role: 'assistant',
            content: [],
            usage: {
              input_tokens: 0,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        },
        ttftMs: expect.any(Number),
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'Hello',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: ' world',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          index: 0,
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'call_123',
            name: 'list_files',
            input: '{"cwd":"/repo"}',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"cwd":"/repo"}',
          },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          index: 1,
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'message_stop',
        },
      },
    ])
  })

  it('does not duplicate assistant text when output item snapshots follow text deltas', async () => {
    const fixture = [
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Codex subscription OK"}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Codex subscription OK"}]}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_text","usage":{"input_tokens":3,"output_tokens":4,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
    ]

    async function* streamChunks(): AsyncGenerator<string> {
      for (const chunk of fixture) {
        yield chunk
      }
    }

    const state = createResponsesStreamState(0)
    let completed:
      | ReturnType<typeof applyResponsesStreamEvent>['completed']
      | undefined

    for await (const payload of parseSSEStream(streamChunks())) {
      const result = applyResponsesStreamEvent(state, payload)
      completed = result.completed
    }

    expect(completed).toEqual({
      contentBlocks: [
        { type: 'text', text: 'Codex subscription OK' },
      ],
      usage: {
        input_tokens: 3,
        output_tokens: 4,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      responseId: 'resp_text',
    })
  })

  it('waits for output_item.done before materializing function calls', async () => {
    const fixture = [
      'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"call_bash","name":"Bash","arguments":{}}}\n\n',
      'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_bash","name":"Bash","arguments":"{\\"command\\":\\"ls\\",\\"description\\":\\"List files\\"}"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_tool","usage":{"input_tokens":4,"output_tokens":6,"input_tokens_details":{"cached_tokens":0}}}}\n\n',
    ]

    async function* streamChunks(): AsyncGenerator<string> {
      for (const chunk of fixture) {
        yield chunk
      }
    }

    const state = createResponsesStreamState(0)
    const output = []
    let completed:
      | ReturnType<typeof applyResponsesStreamEvent>['completed']
      | undefined

    for await (const payload of parseSSEStream(streamChunks())) {
      const result = applyResponsesStreamEvent(state, payload)
      output.push(...result.events)
      completed = result.completed
    }

    expect(
      output.filter(
        event => event.event.type === 'content_block_start',
      ),
    ).toHaveLength(1)
    expect(completed).toEqual({
      contentBlocks: [
        {
          type: 'tool_use',
          id: 'call_bash',
          name: 'Bash',
          input: '{"command":"ls","description":"List files"}',
        },
      ],
      usage: {
        input_tokens: 4,
        output_tokens: 6,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      responseId: 'resp_tool',
    })
  })
})
