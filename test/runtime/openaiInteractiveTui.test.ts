import { afterEach, describe, expect, it } from 'bun:test'
import { writeOpenAIAuthState } from 'src/provider/openaiAuthManager.js'
import { createTempWorkspace } from '../support/fs.js'
import {
  runInteractiveCliSession,
  seedInteractiveRuntimeState,
} from '../support/interactiveRuntime.js'
import { detectExpectBinary } from '../support/interactiveRuntime.js'

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
}

function recentLastRefresh(): string {
  return new Date(Date.now() - 60_000).toISOString()
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
        id: 'resp_interactive',
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

function openAIRuntimeEnv(serverPort: number): Record<string, string> {
  const baseUrl = `http://127.0.0.1:${serverPort}`
  return {
    OPENAI_BASE_URL: baseUrl,
    CODEX_REFRESH_TOKEN_URL_OVERRIDE: `${baseUrl}/oauth/token`,
  }
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
      description: 'Codex-optimized model',
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
  ],
} as const

async function importCodexAuth(
  homeDir: string,
  {
    email,
    plan,
    userId,
    accountId,
    refreshToken = null,
  }: {
    email: string
    plan: string
    userId: string
    accountId: string
    refreshToken?: string | null
  },
): Promise<void> {
  const jwt = createJwt({
    email,
    'https://api.openai.com/auth': {
      chatgpt_plan_type: plan,
      chatgpt_user_id: userId,
      chatgpt_account_id: accountId,
    },
  })

  writeOpenAIAuthState(
    {
      authMode: 'chatgpt',
      authSource: 'codex-import',
      storageMode: 'file',
      tokens: {
        idToken: jwt,
        accessToken: 'codex-access-token',
        refreshToken,
        accountId,
      },
      account: {
        email,
        plan: plan as any,
        userId,
        accountId,
      },
      lastRefresh: recentLastRefresh(),
    },
    { HOME: homeDir },
  )
}

function findAssistantReplay(request: Record<string, any>): Record<string, any> | undefined {
  const input = Array.isArray(request.input) ? request.input : []
  return input.find(
    item => item?.type === 'message' && item.role === 'assistant',
  ) as Record<string, any> | undefined
}

const interactiveIt = detectExpectBinary() ? it : it.skip

function logInteractiveFailure(label: string, result: ReturnType<typeof runInteractiveCliSession> extends Promise<infer R> ? R : never) {
  if (result.status !== 0 || result.error || result.signal) {
    console.error(`[${label}] status=${result.status} signal=${result.signal}`)
    if (result.error) console.error(result.error)
    if (result.stderr) console.error(`[${label}] stderr:\n${result.stderr}`)
    if (result.debugLog) console.error(`[${label}] debugLog:\n${result.debugLog}`)
    if (result.transcript) console.error(`[${label}] transcript:\n${result.transcript}`)
  }
}

describe.serial('runtime OpenAI interactive TUI', () => {
  const servers: Array<{ stop: () => void }> = []

  afterEach(() => {
    for (const server of servers.splice(0, servers.length)) {
      server.stop()
    }
  })

  interactiveIt('shows a startup prompt when Codex auth is missing', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-interactive-missing-auth-')
    await seedInteractiveRuntimeState(homeDir)

    const result = await runInteractiveCliSession({
      homeDir,
      timeoutMs: 60_000,
      scriptBody: `
wait_ms 1500
terminate_session
`,
    })

    logInteractiveFailure('interactive-missing-auth', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(result.transcript.replace(/\s+/g, '')).toContain('ChatGPT/Codexloginrequired')
    expect(result.transcript.replace(/\s+/g, '')).toContain(
      'Run`klaudiaauthlogin`tosignintoChatGPT/Codexinyourbrowser.',
    )
  }, 120_000)

  interactiveIt('shows a startup prompt when imported Codex auth is stale', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-interactive-expired-auth-')
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'expired@example.com',
      plan: 'pro',
      userId: 'user_expired',
      accountId: 'acct_expired',
      refreshToken: 'codex-refresh-token',
    })

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

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },
    })
    servers.push(server)

    const result = await runInteractiveCliSession({
      homeDir,
      env: {
        CODEX_REFRESH_TOKEN_URL_OVERRIDE: `http://127.0.0.1:${server.port}/oauth/token`,
      },
      timeoutMs: 60_000,
      scriptBody: `
wait_ms 1500
terminate_session
`,
    })

    logInteractiveFailure('interactive-expired-auth', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(result.transcript.replace(/\s+/g, '')).toContain('ImportedCodexauthisstale')
    expect(result.transcript.replace(/\s+/g, '')).toContain(
      'YourimportedCodexauthisstalebecauseitsrefreshtokenwasalreadyreusedbyCodex.Run`klaudiaauthlogin`forafreshbrowsersign-in,orrefreshCodexandrerun`klaudiaauthimport-codex`.',
    )
  }, 120_000)

  interactiveIt('boots the source-run REPL, skips Anthropic startup fetches, streams a reply, and exits cleanly', async () => {
    const homeDir = await createTempWorkspace('klaudia-runtime-interactive-')
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'interactive@example.com',
      plan: 'pro',
      userId: 'user_interactive',
      accountId: 'acct_interactive',
    })

    const capturedPaths: string[] = []
    const capturedRequests: Array<Record<string, any>> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        capturedPaths.push(url.pathname)

        if (url.pathname === '/responses' && request.method === 'POST') {
          const body = (await request.json()) as Record<string, any>
          if (body.model === 'codex-mini-latest') {
            return new Response(createSseResponse('Interactive title'), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_interactive_title',
              },
            })
          }

          capturedRequests.push(body)
          return new Response(createSseResponse('interactive hello'), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_interactive_query',
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

    const result = await runInteractiveCliSession({
      homeDir,
      env: openAIRuntimeEnv(server.port),
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "hello"
wait_ms 1500
send_line "/exit"
expect_eof
`,
    })

    logInteractiveFailure('interactive-boot', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(capturedRequests.length).toBeGreaterThan(0)
    expect(result.debugLog).toContain(
      'Skipping Anthropic startup prefetches in OpenAI runtime',
    )
  }, 120_000)

  interactiveIt('renders /help and /status overlays without crashing the OpenAI runtime', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-interactive-overlays-',
    )
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'status@example.com',
      plan: 'plus',
      userId: 'user_status',
      accountId: 'acct_status',
    })

    let responseCalls = 0
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => {
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
          responseCalls += 1
        }

        return new Response('unexpected network call', { status: 500 })
      },
    })
    servers.push(server)

    const result = await runInteractiveCliSession({
      homeDir,
      env: openAIRuntimeEnv(server.port),
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "/help"
wait_ms 1500
send_escape
expect_prompt
wait_ms 400
send_line "/status"
wait_ms 2000
terminate_session
`,
    })

    logInteractiveFailure('interactive-overlays', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.traceEvents).toEqual([])
    expect(responseCalls).toBe(0)
  }, 120_000)

  interactiveIt('replays the prior assistant turn into the second interactive --continue request', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-interactive-continue-',
    )
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'continue@example.com',
      plan: 'pro',
      userId: 'user_continue',
      accountId: 'acct_continue',
    })

    const capturedRequests: Array<Record<string, any>> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async request => {
        const url = new URL(request.url)
        if (url.pathname === '/responses' && request.method === 'POST') {
          const body = (await request.json()) as Record<string, any>
          if (body.model === 'codex-mini-latest') {
            return new Response(createSseResponse('Continue title'), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_continue_title',
              },
            })
          }

          capturedRequests.push(body)
          const text =
            capturedRequests.length === 1
              ? 'first interactive reply'
              : 'second interactive reply'
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

    const firstResult = await runInteractiveCliSession({
      homeDir,
      env: {
        ...openAIRuntimeEnv(server.port),
        TEST_ENABLE_SESSION_PERSISTENCE: '1',
      },
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "hello"
wait_ms 1500
terminate_session
`,
    })

    const secondResult = await runInteractiveCliSession({
      homeDir,
      args: ['--continue'],
      env: {
        ...openAIRuntimeEnv(server.port),
        TEST_ENABLE_SESSION_PERSISTENCE: '1',
      },
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "follow up"
wait_ms 1500
terminate_session
`,
    })

    logInteractiveFailure('interactive-continue-first', firstResult)
    expect(firstResult.error).toBeUndefined()
    expect(firstResult.signal).toBeNull()
    expect(firstResult.status).toBe(0)
    expect(firstResult.stderr).toBe('')
    logInteractiveFailure('interactive-continue-second', secondResult)
    expect(secondResult.error).toBeUndefined()
    expect(secondResult.signal).toBeNull()
    expect(secondResult.status).toBe(0)
    expect(secondResult.stderr).toBe('')
    expect(capturedRequests.length).toBeGreaterThanOrEqual(2)
    expect(secondResult.debugLog).toContain(
      'Skipping Anthropic startup prefetches in OpenAI runtime',
    )
  }, 120_000)

  interactiveIt('accepts a direct visible OpenAI model id via /model and sends it to the backend', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-interactive-visible-model-',
    )
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'visible@example.com',
      plan: 'pro',
      userId: 'user_visible',
      accountId: 'acct_visible',
    })

    const capturedRequests: Array<Record<string, any>> = []
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
          const body = (await request.json()) as Record<string, any>
          if (body.model === 'codex-mini-latest') {
            return new Response(createSseResponse('Interactive title'), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_interactive_title',
              },
            })
          }

          capturedRequests.push(body)
          return new Response(createSseResponse('interactive visible hello'), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_interactive_visible',
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

    const result = await runInteractiveCliSession({
      homeDir,
      env: openAIRuntimeEnv(server.port),
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "/model gpt-5.4-mini"
wait_ms 1000
expect_repl_ready
send_line "/model status"
wait_ms 1000
expect_repl_ready
send_line "hello"
wait_ms 4000
send_line "/exit"
expect_eof
`,
    })

    logInteractiveFailure('interactive-visible-model', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.transcript).toContain('Currentmodel:GPT-5.4-Mini')
    expect(
      capturedRequests.some(request => request.model === 'gpt-5.4-mini'),
    ).toBe(true)
  }, 120_000)

  interactiveIt('accepts a direct raw OpenAI model id via /model and sends it to the backend', async () => {
    const homeDir = await createTempWorkspace(
      'klaudia-runtime-interactive-raw-model-',
    )
    await seedInteractiveRuntimeState(homeDir)
    await importCodexAuth(homeDir, {
      email: 'raw@example.com',
      plan: 'pro',
      userId: 'user_raw',
      accountId: 'acct_raw',
    })

    const capturedRequests: Array<Record<string, any>> = []
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
          const body = (await request.json()) as Record<string, any>
          if (body.model === 'codex-mini-latest') {
            return new Response(createSseResponse('Interactive title'), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'x-request-id': 'req_interactive_title',
              },
            })
          }

          capturedRequests.push(body)
          return new Response(createSseResponse('interactive raw hello'), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'x-request-id': 'req_interactive_raw',
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

    const result = await runInteractiveCliSession({
      homeDir,
      env: openAIRuntimeEnv(server.port),
      timeoutMs: 60_000,
      scriptBody: `
expect_repl_ready
send_line "/model gpt-5.4-custom-preview"
wait_ms 1000
expect_repl_ready
send_line "/model status"
wait_ms 1000
expect_repl_ready
send_line "hello"
wait_ms 4000
send_line "/exit"
expect_eof
`,
    })

    logInteractiveFailure('interactive-raw-model', result)
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.transcript).toContain('Currentmodel:GPT-5.4-Custom-Preview')
    expect(
      capturedRequests.some(
        request => request.model === 'gpt-5.4-custom-preview',
      ),
    ).toBe(true)
  }, 120_000)
})
