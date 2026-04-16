import { afterEach, describe, expect, it } from 'bun:test'
import { AuthCodeListener } from 'src/services/oauth/auth-code-listener.js'
import {
  OPENAI_AUTH_CALLBACK_HOST,
  OPENAI_AUTH_CALLBACK_PATH,
  startOpenAICallbackListener,
} from 'src/services/openaiAuth/index.js'

async function reservePort(): Promise<number> {
  const server = Bun.serve({
    hostname: OPENAI_AUTH_CALLBACK_HOST,
    port: 0,
    fetch: () => new Response('ok'),
  })
  const port = server.port
  server.stop(true)
  return port
}

describe('services/authCodeListener', () => {
  const listeners: AuthCodeListener[] = []

  afterEach(() => {
    for (const listener of listeners.splice(0, listeners.length)) {
      listener.close()
    }
  })

  it('rejects callback requests when the OAuth state mismatches', async () => {
    const listener = new AuthCodeListener(OPENAI_AUTH_CALLBACK_PATH)
    listeners.push(listener)
    const port = await listener.start(0, OPENAI_AUTH_CALLBACK_HOST)
    const authorization = listener.waitForAuthorization('expected-state', async () => {})
    authorization.catch(() => {})

    const response = await fetch(
      `http://${OPENAI_AUTH_CALLBACK_HOST}:${port}${OPENAI_AUTH_CALLBACK_PATH}?code=auth-code-123&state=wrong-state`,
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid state parameter')
    await expect(authorization).rejects.toThrow('Invalid state parameter')
  })

  it('handles /cancel requests by ending the pending login flow', async () => {
    const listener = new AuthCodeListener(OPENAI_AUTH_CALLBACK_PATH)
    listeners.push(listener)
    const port = await listener.start(0, OPENAI_AUTH_CALLBACK_HOST)
    const authorization = listener.waitForAuthorization('expected-state', async () => {})
    authorization.catch(() => {})

    const response = await fetch(
      `http://${OPENAI_AUTH_CALLBACK_HOST}:${port}/cancel`,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Login cancelled')
    await expect(authorization).rejects.toThrow('Login cancelled')
  })

  it('recovers a stale fixed-port listener by cancelling it and rebinding', async () => {
    const fixedPort = await reservePort()

    const staleListener = new AuthCodeListener(OPENAI_AUTH_CALLBACK_PATH)
    listeners.push(staleListener)
    await staleListener.start(fixedPort, OPENAI_AUTH_CALLBACK_HOST)
    const staleAuthorization = staleListener.waitForAuthorization(
      'stale-state',
      async () => {},
    )
    staleAuthorization.catch(() => {})

    const replacementListener = new AuthCodeListener(OPENAI_AUTH_CALLBACK_PATH)
    listeners.push(replacementListener)
    const reboundPort = await startOpenAICallbackListener(replacementListener, {
      CODEX_AUTH_CALLBACK_PORT_OVERRIDE: String(fixedPort),
    })

    expect(reboundPort).toBe(fixedPort)
    await expect(staleAuthorization).rejects.toThrow('Login cancelled')
  })
})
