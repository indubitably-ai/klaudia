import { afterEach, describe, expect, it } from 'bun:test'
import { writeOpenAIAuthState } from 'src/provider/openaiAuthManager.js'
import { createTempWorkspace } from '../support/fs.js'
import { runCliCommand } from '../support/runtime.js'

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
}

function createSseResponse(text: string): string {
  return [
    'event: response.output_text.delta',
    `data: ${JSON.stringify({
      type: 'response.output_text.delta',
      delta: text,
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text,
          },
        ],
      },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_query',
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          input_tokens_details: {
            cached_tokens: 0,
          },
        },
      },
    })}`,
    '',
  ].join('\n')
}

const OPENAI_MODEL_FIXTURE = {
  models: [
    {
      slug: 'gpt-5.4',
      display_name: 'GPT-5.4',
      description: 'Frontier general-purpose model',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 1,
    },
    {
      slug: 'gpt-5.4-mini',
      display_name: 'GPT-5.4-Mini',
      description: 'Fastest GPT-5.4 variant',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 3,
    },
    {
      slug: 'gpt-5.3-codex',
      display_name: 'GPT-5.3-Codex',
      description: 'Codex-optimized reasoning model',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 5,
    },
    {
      slug: 'gpt-5.3-codex-spark',
      display_name: 'GPT-5.3-Codex-Spark',
      description: 'Ultra-fast coding model',
      default_reasoning_level: 'high',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: false,
      priority: 6,
    },
    {
      slug: 'gpt-5.2',
      display_name: 'GPT-5.2',
      description: 'Previous-generation frontier model',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'low' },
        { effort: 'medium', description: 'medium' },
        { effort: 'high', description: 'high' },
        { effort: 'xhigh', description: 'xhigh' },
      ],
      visibility: 'list',
      supported_in_api: true,
      priority: 9,
    },
    {
      slug: 'gpt-hidden',
      display_name: 'Hidden',
      description: 'Hidden from picker',
      default_reasoning_level: null,
      supported_reasoning_levels: [],
      visibility: 'hide',
      supported_in_api: true,
      priority: 99,
    },
  ],
} as const

const OPENAI_VISIBLE_MODEL_FIXTURE = OPENAI_MODEL_FIXTURE.models.filter(
  model => model.supported_in_api && model.visibility === 'list',
)

function parseNdjson(stdout: string): Array<Record<string, any>> {
  return stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, any>)
}

function extractAssistantText(message: Record<string, any>): string {
  const content = Array.isArray(message.message?.content)
    ? message.message.content
    : []

  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        block?.type === 'text' && typeof block.text === 'string',
    )
    .map(block => block.text)
    .join('')
}

function expectExactNdjsonShape(
  stdout: string,
): [Record<string, any>, Record<string, any>, Record<string, any>] {
  const messages = parseNdjson(stdout)
  expect(messages).toHaveLength(3)
  expect(messages[0]).toMatchObject({
    type: 'system',
    subtype: 'init',
  })
  expect(messages[1]?.type).toBe('assistant')
  expect(messages[2]?.type).toBe('result')
  return messages as [Record<string, any>, Record<string, any>, Record<string, any>]
}

function expectInitAndFinalResult(stdout: string): Array<Record<string, any>> {
  const messages = parseNdjson(stdout)
  expect(
    messages.some(
      message => message.type === 'system' && message.subtype === 'init',
    ),
  ).toBe(true)
  expect(messages.at(-1)?.type).toBe('result')
  return messages
}

function writeRuntimeAuth(homeDir: string): void {
  const jwt = createJwt({
    email: 'user@example.com',
    'https://api.openai.com/auth': {
      chatgpt_plan_type: 'pro',
      chatgpt_user_id: 'user_query',
      chatgpt_account_id: 'acct_query',
    },
  })

  writeOpenAIAuthState(
    {
      authMode: 'chatgpt',
      authSource: 'browser',
      storageMode: 'file',
      tokens: {
        idToken: jwt,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accountId: 'acct_query',
      },
      account: {
        email: 'user@example.com',
        plan: 'pro',
        userId: 'user_query',
        accountId: 'acct_query',
      },
      lastRefresh: new Date().toISOString(),
    },
    { HOME: homeDir },
  )
}

describe('runtime OpenAI query smoke', () => {
  const servers: Array<{ stop: () => void }> = []

  afterEach(() => {
    for (const server of servers.splice(0, servers.length)) {
      server.stop()
    }
  })

  for (const testCase of [
    {
      name: 'single-line assistant text',
      expectedText: 'PARSE-ONE: A_B-C.123 [] {} ()',
    },
    {
      name: 'multiline assistant text',
      expectedText: 'first line\nsecond line\nthird line',
    },
    {
      name: 'json-shaped assistant text',
      expectedText:
        '{"status":"ok","items":[1,2,3],"note":"parse-check"}',
    },
  ]) {
    it(`boots print mode against a local Responses fixture server for ${testCase.name}`, async () => {
      const homeDir = await createTempWorkspace('klaudia-runtime-query-')
      writeRuntimeAuth(homeDir)

      let capturedRequest: Record<string, unknown> | null = null
      let capturedHeaders: Record<string, string> | null = null
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async request => {
          const url = new URL(request.url)
          if (url.pathname === '/responses' && request.method === 'POST') {
            capturedRequest = (await request.json()) as Record<string, unknown>
            capturedHeaders = Object.fromEntries(request.headers.entries())
            return new Response(createSseResponse(testCase.expectedText), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_query',
              },
            })
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        },
      })
      servers.push(server)

      const result = await runCliCommand(
        ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
        {
          homeDir,
          env: {
            OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          timeoutMs: 30_000,
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.traceEvents).toEqual([])
      expect(capturedRequest).not.toBeNull()
      expect(capturedHeaders).not.toBeNull()
      expect(capturedRequest?.model).toBe('gpt-5.2-codex')
      expect(capturedRequest?.store).toBe(false)
      expect(capturedRequest?.stream).toBe(true)
      expect(capturedHeaders?.accept).toBe('text/event-stream')
      expect(capturedHeaders?.authorization).toBe('Bearer access-token')
      expect(capturedHeaders?.['chatgpt-account-id']).toBe('acct_query')
      expect(capturedHeaders?.['x-client-request-id']).toEqual(expect.any(String))

      const messages = expectExactNdjsonShape(result.stdout)
      expect(messages[1]?.type).toBe('assistant')
      expect(extractAssistantText(messages[1]!)).toBe(testCase.expectedText)
      expect(messages[2]).toMatchObject({
        type: 'result',
        subtype: 'success',
        result: testCase.expectedText,
      })
    })
  }

  for (const model of OPENAI_VISIBLE_MODEL_FIXTURE) {
    it(`uses live catalog model ${model.slug} for print mode and emits the resolved init model`, async () => {
      const homeDir = await createTempWorkspace('klaudia-runtime-query-model-')
      writeRuntimeAuth(homeDir)

      let capturedRequest: Record<string, unknown> | null = null
      let capturedHeaders: Record<string, string> | null = null
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async request => {
          const url = new URL(request.url)
          if (url.pathname === '/models' && request.method === 'GET') {
            return new Response(JSON.stringify(OPENAI_MODEL_FIXTURE), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ETag: '"fixture-models"',
              },
            })
          }

          if (url.pathname === '/responses' && request.method === 'POST') {
            capturedRequest = (await request.json()) as Record<string, unknown>
            capturedHeaders = Object.fromEntries(request.headers.entries())
            return new Response(createSseResponse(`reply from ${model.slug}`), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': `req_${model.slug}`,
              },
            })
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        },
      })
      servers.push(server)

      const result = await runCliCommand(
        [
          '--bare',
          '--model',
          model.slug,
          '-p',
          'hello',
          '--output-format',
          'stream-json',
          '--verbose',
        ],
        {
          homeDir,
          env: {
            OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          timeoutMs: 30_000,
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(capturedRequest?.model).toBe(model.slug)
      expect(capturedRequest?.store).toBe(false)
      expect(capturedRequest?.stream).toBe(true)
      expect(capturedHeaders?.accept).toBe('text/event-stream')
      expect(capturedHeaders?.authorization).toBe('Bearer access-token')
      expect(capturedHeaders?.['chatgpt-account-id']).toBe('acct_query')

      const messages = expectExactNdjsonShape(result.stdout)
      expect(messages[0]).toMatchObject({
        type: 'system',
        subtype: 'init',
        model: model.slug,
      })
      expect(extractAssistantText(messages[1]!)).toBe(`reply from ${model.slug}`)
      expect(messages[2]).toMatchObject({
        type: 'result',
        subtype: 'success',
        result: `reply from ${model.slug}`,
      })
    })
  }

  it('returns plain text for non-bare -p hello', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-non-bare-text-')
    writeRuntimeAuth(homeDir)

    const expectedText = 'non-bare text response'
    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          responseCalls += 1
          return new Response(createSseResponse(expectedText), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_non_bare_text',
            },
          })
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const result = await runCliCommand(['-p', 'hello'], {
      safeMode: false,
      homeDir,
      env: {
        OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
        CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS: '1',
      },
      timeoutMs: 30_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(responseCalls).toBe(1)
    expect(result.stdout).toBe(`${expectedText}\n`)
  })

  it('emits init and result for non-bare stream-json print mode', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-query-non-bare-stream-',
    )
    writeRuntimeAuth(homeDir)

    const expectedText = 'non-bare stream response'
    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          responseCalls += 1
          return new Response(createSseResponse(expectedText), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_non_bare_stream',
            },
          })
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        safeMode: false,
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS: '1',
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(responseCalls).toBe(1)

    const messages = expectInitAndFinalResult(result.stdout)
    const assistant = messages.find(message => message.type === 'assistant')
    expect(assistant).toBeDefined()
    expect(extractAssistantText(assistant!)).toBe(expectedText)
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'success',
      result: expectedText,
    })
  })

  it('emits an explicit stream-json error when non-bare setup fails before headless init', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-query-non-bare-failure-',
    )

    const result = await runCliCommand(
      ['-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        safeMode: false,
        homeDir,
        env: {
          CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS: '1',
          CLAUDE_CODE_TEST_FORCE_NON_BARE_SETUP_FAILURE: '1',
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toBe('')

    const messages = parseNdjson(result.stdout)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
    })
    expect(messages[0]?.errors).toEqual([
      expect.stringContaining('setup()'),
    ])
  })

  it('does not call /responses when Klaudia auth is missing', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-missing-auth-')
    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => {
        responseCalls += 1
        return new Response('unexpected network call', { status: 500 })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(responseCalls).toBe(0)

    const [, assistant, summary] = expectExactNdjsonShape(result.stdout)
    const expectedMessage =
      'Not logged in · Run `klaudia auth login` to sign in to ChatGPT/Codex.'
    expect(extractAssistantText(assistant)).toBe(expectedMessage)
    expect(summary).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: expectedMessage,
    })
  })

  it('does not call /responses when imported Codex auth is stale', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-stale-import-')
    let responseCalls = 0
    const jwt = createJwt({
      email: 'stale@example.com',
      'https://api.openai.com/auth': {
        chatgpt_plan_type: 'pro',
        chatgpt_user_id: 'user_stale',
        chatgpt_account_id: 'acct_stale',
      },
    })

    writeOpenAIAuthState(
      {
        authMode: 'chatgpt',
        authSource: 'codex-import',
        storageMode: 'file',
        tokens: {
          idToken: jwt,
          accessToken: 'stale-access-token',
          refreshToken: 'stale-refresh-token',
          accountId: 'acct_stale',
        },
        account: {
          email: 'stale@example.com',
          plan: 'pro',
          userId: 'user_stale',
          accountId: 'acct_stale',
        },
        lastRefresh: '2026-04-01T00:00:00.000Z',
      },
      { HOME: homeDir },
    )

    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => {
        const url = new URL(request.url)
        if (url.pathname === '/oauth/token' && request.method === 'POST') {
          return new Response(
            JSON.stringify({
              error: {
                code: 'refresh_token_reused',
                message: 'refresh token already used',
              },
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        responseCalls += 1
        return new Response('unexpected network call', { status: 500 })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          CODEX_REFRESH_TOKEN_URL_OVERRIDE: `http://127.0.0.1:${server.port}/oauth/token`,
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(responseCalls).toBe(0)

    const [, assistant, summary] = expectExactNdjsonShape(result.stdout)
    const expectedMessage =
      'Imported Codex auth is stale · Run `klaudia auth login` for a fresh browser sign-in, or refresh Codex and rerun `klaudia auth import-codex`.'
    expect(extractAssistantText(assistant)).toBe(expectedMessage)
    expect(summary).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: expectedMessage,
    })
  })

  it('does not call /responses when unsupported legacy provider env is present', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-unsupported-env-')
    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => {
        responseCalls += 1
        return new Response('unexpected network call', { status: 500 })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          ANTHROPIC_API_KEY: 'sk-ant',
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(responseCalls).toBe(0)

    const [, assistant, summary] = expectExactNdjsonShape(result.stdout)
    const expectedMessage =
      'Unsupported provider environment detected: ANTHROPIC_API_KEY. Remove Anthropic or cloud-provider env vars and use the Codex subscription runtime instead.'
    expect(extractAssistantText(assistant)).toBe(expectedMessage)
    expect(summary).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: expectedMessage,
    })
  })

  it('retries a transient /responses 500 and succeeds without emitting an assistant API error', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-retry-500-')
    writeRuntimeAuth(homeDir)

    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          responseCalls += 1
          if (responseCalls === 1) {
            return new Response(
              JSON.stringify({
                error: {
                  message: 'transient upstream 500',
                },
              }),
              {
                status: 500,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            )
          }

          return new Response(createSseResponse('retry succeeded'), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_retry_query',
            },
          })
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(responseCalls).toBe(2)

    const messages = expectExactNdjsonShape(result.stdout)
    expect(messages[1]?.error).toBeUndefined()
    expect(extractAssistantText(messages[1]!)).toBe('retry succeeded')
    expect(messages[2]).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'retry succeeded',
    })
  })

  it('classifies exhausted persistent /responses 500 failures as server_error', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-server-error-')
    writeRuntimeAuth(homeDir)

    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          responseCalls += 1
          return new Response(
            JSON.stringify({
              error: {
                message: 'persistent upstream 500',
              },
            }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const result = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
        },
        timeoutMs: 30_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(responseCalls).toBe(4)

    const [, assistant, summary] = expectExactNdjsonShape(result.stdout)
    expect(assistant?.error).toBe('server_error')
    expect(extractAssistantText(assistant)).toContain(
      'API Error: OpenAI Responses request failed (500)',
    )
    expect(summary).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: true,
    })
  })

  it('replays the previous assistant turn into the second --continue request as assistant output_text', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-query-continue-')
    writeRuntimeAuth(homeDir)

    const capturedRequests: Array<Record<string, any>> = []
    const replies = ['first assistant reply', 'second assistant reply']
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          capturedRequests.push((await request.json()) as Record<string, any>)
          const text = replies[capturedRequests.length - 1] ?? 'unexpected'
          return new Response(createSseResponse(text), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': `req_continue_${capturedRequests.length}`,
            },
          })
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const firstResult = await runCliCommand(
      ['--bare', '-p', 'hello', '--output-format', 'stream-json', '--verbose'],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          TEST_ENABLE_SESSION_PERSISTENCE: '1',
        },
        timeoutMs: 30_000,
      },
    )
    const secondResult = await runCliCommand(
      [
        '--bare',
        '--continue',
        '-p',
        'follow up',
        '--output-format',
        'stream-json',
        '--verbose',
      ],
      {
        homeDir,
        env: {
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}`,
          TEST_ENABLE_SESSION_PERSISTENCE: '1',
        },
        timeoutMs: 30_000,
      },
    )

    expect(firstResult.error).toBeUndefined()
    expect(firstResult.signal).toBeNull()
    expect(firstResult.status).toBe(0)
    expect(firstResult.stderr).toBe('')
    expect(secondResult.error).toBeUndefined()
    expect(secondResult.signal).toBeNull()
    expect(secondResult.status).toBe(0)
    expect(secondResult.stderr).toBe('')
    expect(capturedRequests).toHaveLength(2)

    const secondInput = Array.isArray(capturedRequests[1]?.input)
      ? capturedRequests[1]!.input
      : []
    const assistantReplay = secondInput.find(
      item => item?.type === 'message' && item.role === 'assistant',
    )
    expect(assistantReplay).toBeDefined()
    expect(assistantReplay?.content).toEqual([
      {
        type: 'output_text',
        text: 'first assistant reply',
      },
    ])
  })
})
