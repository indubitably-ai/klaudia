import { describe, expect, it } from 'bun:test'
import {
  createResponse,
  streamResponse,
} from 'src/services/api/openai/transport.js'
import { createOpenAIProviderConfig } from 'src/provider/providerRegistry.js'

const AUTH = {
  authMode: 'chatgpt',
  authSource: 'browser',
  storageMode: 'file',
  tokens: {
    idToken: 'id-token',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accountId: 'acct_123',
  },
  account: {
    email: 'user@example.com',
    plan: 'pro',
    userId: 'user_123',
    accountId: 'acct_123',
  },
  lastRefresh: '2026-04-04T12:00:00.000Z',
} as const

const STREAM_REQUEST = {
  model: 'gpt-5.2-codex',
  input: [
    {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'hello',
        },
      ],
    },
  ],
  store: false,
  stream: true,
}

async function collectStream(
  iterable: AsyncIterable<unknown>,
): Promise<unknown[]> {
  const output = []
  for await (const item of iterable) {
    output.push(item)
  }
  return output
}

function createProvider(
  overrides?: Partial<ReturnType<typeof createOpenAIProviderConfig>>,
): ReturnType<typeof createOpenAIProviderConfig> {
  const provider = createOpenAIProviderConfig({
    OPENAI_BASE_URL: 'https://codex.example.test',
  })
  const { retry: retryOverrides, ...providerOverrides } = overrides ?? {}

  return {
    ...provider,
    ...providerOverrides,
    retry: {
      ...provider.retry,
      baseDelayMs: 0,
      ...retryOverrides,
    },
  }
}

describe('openai transport', () => {
  it('sends streaming auth and organization headers and preserves the response request id', async () => {
    let capturedUrl: string | null = null
    let capturedInit: RequestInit | undefined

    const output = await collectStream(
      streamResponse({
        request: STREAM_REQUEST,
        auth: AUTH,
        env: {
          OPENAI_BASE_URL: 'https://codex.example.test',
          OPENAI_ORGANIZATION: 'org_123',
          OPENAI_PROJECT: 'proj_456',
        },
        fetchImpl: async (input, init) => {
          capturedUrl = String(input)
          capturedInit = init
          return new Response(
            [
              'event: response.output_text.delta',
              'data: {"type":"response.output_text.delta","delta":"hello"}',
              '',
              'event: response.output_item.done',
              'data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}}',
              '',
              'event: response.completed',
              'data: {"type":"response.completed","response":{"id":"resp_stream","usage":{"input_tokens":3,"output_tokens":4,"input_tokens_details":{"cached_tokens":0}}}}',
              '',
            ].join('\n'),
            {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_stream',
              },
            },
          )
        },
      }),
    )

    const headers = capturedInit?.headers as Record<string, string>

    expect(capturedUrl).toBe('https://codex.example.test/responses')
    expect(capturedInit?.method).toBe('POST')
    expect(headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'ChatGPT-Account-ID': 'acct_123',
      Accept: 'text/event-stream',
      'OpenAI-Organization': 'org_123',
      'OpenAI-Project': 'proj_456',
      'Content-Type': 'application/json',
    })
    expect(headers['X-Client-Request-Id']).toEqual(expect.any(String))
    expect(output.at(-1)).toEqual({
      type: 'completed',
      completion: {
        contentBlocks: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
        usage: {
          input_tokens: 3,
          output_tokens: 4,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        responseId: 'resp_stream',
        requestId: 'req_stream',
      },
    })
  })

  it('sends non-stream auth headers and preserves the response request id', async () => {
    let capturedUrl: string | null = null
    let capturedInit: RequestInit | undefined

    const result = await createResponse({
      request: STREAM_REQUEST,
      auth: AUTH,
      env: {
        OPENAI_BASE_URL: 'https://codex.example.test',
        OPENAI_ORGANIZATION: 'org_123',
        OPENAI_PROJECT: 'proj_456',
      },
      fetchImpl: async (input, init) => {
        capturedUrl = String(input)
        capturedInit = init
        return new Response(
          JSON.stringify({
            id: 'resp_create',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'created',
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 8,
              output_tokens: 13,
              input_tokens_details: {
                cached_tokens: 2,
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'openai-request-id': 'req_create',
            },
          },
        )
      },
    })

    const headers = capturedInit?.headers as Record<string, string>

    expect(capturedUrl).toBe('https://codex.example.test/responses')
    expect(capturedInit?.method).toBe('POST')
    expect(headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'ChatGPT-Account-ID': 'acct_123',
      'OpenAI-Organization': 'org_123',
      'OpenAI-Project': 'proj_456',
      'Content-Type': 'application/json',
    })
    expect(headers.Accept).toBeUndefined()
    expect(headers['X-Client-Request-Id']).toEqual(expect.any(String))
    expect(result).toEqual({
      contentBlocks: [
        {
          type: 'text',
          text: 'created',
        },
      ],
      usage: {
        input_tokens: 8,
        output_tokens: 13,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 0,
      },
      responseId: 'resp_create',
      requestId: 'req_create',
    })
  })

  it('surfaces non-retryable response status and body for createResponse', async () => {
    await expect(
      createResponse({
        request: STREAM_REQUEST,
        auth: AUTH,
        provider: createProvider(),
        fetchImpl: async () =>
          new Response('unprocessable', {
            status: 422,
            statusText: 'Unprocessable Entity',
          }),
      }),
    ).rejects.toThrow('OpenAI Responses request failed (422): unprocessable')
  })

  it('retries transient 5xx responses for createResponse', async () => {
    let attempts = 0

    const result = await createResponse({
      request: STREAM_REQUEST,
      auth: AUTH,
      provider: createProvider(),
      fetchImpl: async () => {
        attempts += 1
        if (attempts === 1) {
          return new Response('upstream unavailable', {
            status: 500,
            statusText: 'Internal Server Error',
          })
        }

        return new Response(
          JSON.stringify({
            id: 'resp_retry_create',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'retried',
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 1,
              output_tokens: 2,
              input_tokens_details: {
                cached_tokens: 0,
              },
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': 'req_retry_create',
            },
          },
        )
      },
    })

    expect(attempts).toBe(2)
    expect(result.responseId).toBe('resp_retry_create')
    expect(result.requestId).toBe('req_retry_create')
  })

  it('surfaces non-2xx response status and body for streamResponse', async () => {
    await expect(
      collectStream(
        streamResponse({
          request: STREAM_REQUEST,
          auth: AUTH,
          env: {
            OPENAI_BASE_URL: 'https://codex.example.test',
          },
          fetchImpl: async () =>
            new Response('unauthorized', {
              status: 401,
              statusText: 'Unauthorized',
            }),
        }),
      ),
    ).rejects.toThrow('OpenAI Responses request failed (401): unauthorized')
  })

  it('does not retry client errors for streamResponse', async () => {
    let attempts = 0

    await expect(
      collectStream(
        streamResponse({
          request: STREAM_REQUEST,
          auth: AUTH,
          provider: createProvider(),
          fetchImpl: async () => {
            attempts += 1
            return new Response('forbidden', {
              status: 403,
              statusText: 'Forbidden',
            })
          },
        }),
      ),
    ).rejects.toThrow('OpenAI Responses request failed (403): forbidden')

    expect(attempts).toBe(1)
  })

  it('retries transient transport failures for streamResponse', async () => {
    let attempts = 0

    const output = await collectStream(
      streamResponse({
        request: STREAM_REQUEST,
        auth: AUTH,
        provider: createProvider(),
        fetchImpl: async () => {
          attempts += 1
          if (attempts === 1) {
            throw new Error('socket hang up')
          }

          return new Response(
            [
              'event: response.output_text.delta',
              'data: {"type":"response.output_text.delta","delta":"hello"}',
              '',
              'event: response.output_item.done',
              'data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}}',
              '',
              'event: response.completed',
              'data: {"type":"response.completed","response":{"id":"resp_retry_stream","usage":{"input_tokens":3,"output_tokens":4,"input_tokens_details":{"cached_tokens":0}}}}',
              '',
            ].join('\n'),
            {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_retry_stream',
              },
            },
          )
        },
      }),
    )

    expect(attempts).toBe(2)
    expect(output.at(-1)).toEqual({
      type: 'completed',
      completion: {
        contentBlocks: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
        usage: {
          input_tokens: 3,
          output_tokens: 4,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        responseId: 'resp_retry_stream',
        requestId: 'req_retry_stream',
      },
    })
  })

  it('does not retry once the Responses stream has started and then closes before completion', async () => {
    let attempts = 0

    await expect(
      collectStream(
        streamResponse({
          request: STREAM_REQUEST,
          auth: AUTH,
          provider: createProvider(),
          fetchImpl: async () => {
            attempts += 1
            return new Response(
              [
                'event: response.output_text.delta',
                'data: {"type":"response.output_text.delta","delta":"partial"}',
                '',
              ].join('\n'),
              {
                status: 200,
                headers: {
                  'Content-Type': 'text/event-stream',
                  'x-request-id': 'req_eof',
                },
              },
            )
          },
        }),
      ),
    ).rejects.toThrow('OpenAI Responses stream closed before completion')

    expect(attempts).toBe(1)
  })
})
