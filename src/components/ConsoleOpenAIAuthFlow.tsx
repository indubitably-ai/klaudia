import React, { useEffect, useRef, useState } from 'react'
import { installOAuthTokens } from '../cli/handlers/auth.js'
import { readOpenAIAuthState } from '../provider/openaiAuthManager.js'
import { OpenAIBrowserAuthService } from '../services/openaiAuth/index.js'
import { errorMessage } from '../utils/errors.js'
import { Box, Link, Text, useInput } from '../ink.js'
import { Spinner } from './Spinner.js'

type Props = {
  onDone(result: 'success' | 'cancelled'): void
}

type LoginPhase =
  | { state: 'starting' }
  | { state: 'waiting'; url: string }
  | {
      state: 'success'
      email: string | null
      plan: string
    }
  | {
      state: 'error'
      message: string
    }

export function ConsoleOpenAIAuthFlow({
  onDone,
}: Props): React.ReactNode {
  const serviceRef = useRef<OpenAIBrowserAuthService | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<LoginPhase>({ state: 'starting' })

  useEffect(() => {
    let active = true
    const service = new OpenAIBrowserAuthService()
    serviceRef.current = service
    setPhase({ state: 'starting' })

    void (async () => {
      try {
        const tokens = await service.startLoginFlow(async url => {
          if (active) {
            setPhase({
              state: 'waiting',
              url,
            })
          }
        })

        if (!active) {
          return
        }

        await installOAuthTokens({
          ...tokens,
          authSource: 'browser',
        })

        if (!active) {
          return
        }

        const authState = readOpenAIAuthState()
        setPhase({
          state: 'success',
          email: authState?.account.email ?? null,
          plan: authState?.account.plan ?? 'unknown',
        })
      } catch (error) {
        if (!active) {
          return
        }

        setPhase({
          state: 'error',
          message: errorMessage(error),
        })
      }
    })()

    return () => {
      active = false
      service.cleanup()
    }
  }, [attempt])

  useInput((_input, key) => {
    if (key.escape) {
      onDone(phase.state === 'success' ? 'success' : 'cancelled')
      return
    }

    if (!key.return) {
      return
    }

    if (phase.state === 'success') {
      onDone('success')
    } else if (phase.state === 'error') {
      setAttempt(current => current + 1)
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="claude">Sign in to ChatGPT/Codex</Text>
      <Text>
        Klaudia will open the ChatGPT/Codex browser login flow and store fresh
        credentials in your local Klaudia config.
      </Text>
      {phase.state === 'starting' ? (
        <Box>
          <Spinner />
          <Text> Starting the local login server…</Text>
        </Box>
      ) : null}
      {phase.state === 'waiting' ? (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Spinner />
            <Text> Waiting for browser sign-in to complete…</Text>
          </Box>
          <Text dimColor>If your browser did not open automatically, open:</Text>
          <Link url={phase.url} />
          <Text dimColor>Return here after finishing in your browser. Press Esc to cancel.</Text>
        </Box>
      ) : null}
      {phase.state === 'success' ? (
        <Box flexDirection="column" gap={1}>
          {phase.email ? (
            <Text dimColor>
              Signed in as <Text>{phase.email}</Text>
            </Text>
          ) : null}
          <Text color="success">
            Login successful{phase.plan !== 'unknown' ? ` (${phase.plan})` : ''}.
            Press <Text bold>Enter</Text> to continue.
          </Text>
        </Box>
      ) : null}
      {phase.state === 'error' ? (
        <Box flexDirection="column" gap={1}>
          <Text color="error">{phase.message}</Text>
          <Text dimColor>
            Press <Text bold>Enter</Text> to retry, or <Text bold>Esc</Text> to
            exit.
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
