import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { createTempWorkspace, ensureDir } from './fs.js'

const REPO_ROOT = resolve(process.cwd())
const RUN_BUN_SCRIPT = resolve(REPO_ROOT, 'scripts/run-bun.mjs')
const CLI_ENTRYPOINT = 'src/entrypoints/cli.tsx'
const NODE_BINARY = Bun.which('node') ?? 'node'
const BUN_BINARY = Bun.which('bun') ?? process.execPath

const SENSITIVE_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_PROFILE',
  'AZURE_OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'OPENAI_API_KEY',
]

const TEST_RUNNER_ENV_KEYS = [
  'BUN_TEST',
  'JEST_WORKER_ID',
  'VITEST',
  'VITEST_POOL_ID',
  'VITEST_WORKER_ID',
] as const

export type StartupTraceEvent = {
  type: string
  pid?: number
  platform?: string
  command?: string
  args?: string[]
}

type RuntimeOverrides = Record<string, string | undefined>

export type RuntimeCommandOptions = {
  safeMode?: boolean
  traceOnly?: boolean
  env?: RuntimeOverrides
  homeDir?: string
  timeoutMs?: number
}

export type RuntimeCommandResult = {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: Error
  homeDir: string
  traceFile: string
  traceEvents: StartupTraceEvent[]
}

function scrubRuntimeEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source }

  for (const key of SENSITIVE_ENV_KEYS) {
    delete env[key]
  }

  for (const key of Object.keys(env)) {
    if (
      key.startsWith('CLAUDE_CODE_') &&
      /(TOKEN|KEY|AUTH|SESSION|PROFILE|CREDENTIAL)/.test(key)
    ) {
      delete env[key]
    }
  }

  if (env.NODE_ENV === 'test') {
    delete env.NODE_ENV
  }

  for (const key of TEST_RUNNER_ENV_KEYS) {
    delete env[key]
  }

  return env
}

function applyOverrides(
  env: NodeJS.ProcessEnv,
  overrides: RuntimeOverrides | undefined,
): NodeJS.ProcessEnv {
  if (!overrides) {
    return env
  }

  const nextEnv = { ...env }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete nextEnv[key]
    } else {
      nextEnv[key] = value
    }
  }

  return nextEnv
}

async function readTraceEvents(traceFile: string): Promise<StartupTraceEvent[]> {
  if (!existsSync(traceFile)) {
    return []
  }

  const content = await readFile(traceFile, 'utf8')
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as StartupTraceEvent)
}

export async function createRuntimeEnv(
  options: RuntimeCommandOptions,
): Promise<{ env: NodeJS.ProcessEnv; homeDir: string; traceFile: string }> {
  const homeDir =
    options.homeDir ?? (await createTempWorkspace('klaudia-runtime-'))
  const traceFile = join(homeDir, 'startup-trace.jsonl')
  const configDir = join(homeDir, '.config')
  const cacheDir = join(homeDir, '.cache')
  const dataDir = join(homeDir, '.local', 'share')

  await ensureDir(configDir)
  await ensureDir(cacheDir)
  await ensureDir(dataDir)

  let env = scrubRuntimeEnv(process.env)
  env = {
    ...env,
    HOME: homeDir,
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    XDG_DATA_HOME: dataDir,
    NO_COLOR: '1',
    TZ: 'UTC',
    CI: '1',
    BUN_BIN: BUN_BINARY,
    CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_FILE: traceFile,
  }

  if (options.safeMode ?? true) {
    env.CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS = '1'
    env.CLAUDE_CODE_SIMPLE = '1'
  } else {
    delete env.CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS
    delete env.CLAUDE_CODE_SIMPLE
  }

  if (options.traceOnly ?? true) {
    env.CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_ONLY = '1'
  } else {
    delete env.CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_ONLY
  }

  env = applyOverrides(env, options.env)

  return {
    env,
    homeDir,
    traceFile,
  }
}

async function runRuntimeProcess(
  args: string[],
  options: RuntimeCommandOptions,
): Promise<RuntimeCommandResult> {
  const { env, homeDir, traceFile } = await createRuntimeEnv(options)
  const timeoutMs = options.timeoutMs ?? 20_000

  return await new Promise(resolve => {
    const child = spawn(NODE_BINARY, [RUN_BUN_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => {
      stdout += chunk
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', chunk => {
      stderr += chunk
    })

    const finalize = async (
      status: number | null,
      signal: NodeJS.Signals | null,
      error?: Error,
    ) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)

      resolve({
        status,
        signal,
        stdout,
        stderr,
        error,
        homeDir,
        traceFile,
        traceEvents: await readTraceEvents(traceFile),
      })
    }

    child.on('error', error => {
      void finalize(null, null, error)
    })

    child.on('close', (status, signal) => {
      const timeoutError =
        timedOut && signal
          ? new Error(`Runtime command timed out after ${timeoutMs}ms`)
          : undefined
      void finalize(status, signal, timeoutError)
    })

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL')
        }
      }, 1_000).unref()
    }, timeoutMs)
    timeout.unref()
  })
}

export async function runCliCommand(
  args: string[],
  options: RuntimeCommandOptions = {},
): Promise<RuntimeCommandResult> {
  return runRuntimeProcess([CLI_ENTRYPOINT, ...args], options)
}

export async function runBunEval(
  code: string,
  options: RuntimeCommandOptions = {},
): Promise<RuntimeCommandResult> {
  return runRuntimeProcess(['-e', code], options)
}
