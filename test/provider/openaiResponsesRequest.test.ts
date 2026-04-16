import { describe, expect, it } from 'bun:test'
import { buildResponsesRequest } from 'src/services/api/openai/request.js'

describe('openai responses request builder', () => {
  it('maps transcript, tools, reasoning, and structured output into a Responses payload', () => {
    const request = buildResponsesRequest({
      model: 'claude-sonnet-4-6',
      systemPrompt: ['You are Klaudia.', 'Stay concise.'],
      messages: [
        {
          type: 'user',
          message: {
            content: [
              { type: 'text', text: 'Summarize this repo.' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'aGVsbG8=',
                },
              },
            ],
          },
        },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I need repo metadata first.' },
              {
                type: 'tool_use',
                id: 'call_123',
                name: 'list_files',
                input: { cwd: '/repo' },
              },
            ],
          },
        },
        {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'call_123',
                content: {
                  files: ['README.md', 'src/index.ts'],
                },
              },
            ],
          },
        },
      ],
      tools: [
        {
          name: 'list_files',
          description: 'List files in the current workspace.',
          input_schema: {
            type: 'object',
            properties: {
              cwd: { type: 'string' },
            },
            required: ['cwd'],
          },
          strict: true,
        },
      ],
      toolChoice: { name: 'list_files' },
      outputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
      },
      reasoningEffort: 'high',
      verbosity: 'high',
    })

    expect(request).toEqual({
      model: 'gpt-5.2-codex',
      instructions: 'You are Klaudia.\n\nStay concise.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Summarize this repo.' },
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aGVsbG8=',
            },
          ],
        },
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'I need repo metadata first.' },
          ],
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'list_files',
          arguments: '{"cwd":"/repo"}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '{"files":["README.md","src/index.ts"]}',
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'list_files',
          description: 'List files in the current workspace.',
          parameters: {
            type: 'object',
            properties: {
              cwd: { type: 'string' },
            },
            required: ['cwd'],
          },
          strict: true,
        },
      ],
      tool_choice: {
        type: 'function',
        name: 'list_files',
      },
      parallel_tool_calls: true,
      reasoning: {
        effort: 'high',
      },
      store: false,
      stream: true,
      include: [],
      text: {
        verbosity: 'high',
        format: {
          type: 'json_schema',
          strict: true,
          name: 'klaudia_output_schema',
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
            },
            required: ['summary'],
          },
        },
      },
    })
  })
})
