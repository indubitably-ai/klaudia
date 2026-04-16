import { spawn, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import stripAnsi from 'strip-ansi'
import {
  createRuntimeEnv,
  type RuntimeCommandOptions,
  type StartupTraceEvent,
} from './runtime.js'

const REPO_ROOT = resolve(process.cwd())
const RUN_BUN_SCRIPT = resolve(REPO_ROOT, 'scripts/run-bun.mjs')
const CLI_ENTRYPOINT = resolve(REPO_ROOT, 'src/entrypoints/cli.tsx')
const NODE_BINARY = Bun.which('node') ?? 'node'

export type InteractiveRuntimeOptions = RuntimeCommandOptions & {
  args?: string[]
  scriptBody: string
}

export type InteractiveRuntimeResult = {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: Error
  homeDir: string
  traceFile: string
  traceEvents: StartupTraceEvent[]
  transcriptFile: string
  transcript: string
  debugFile: string
  debugLog: string
}

const DEFAULT_INTERACTIVE_GLOBAL_CONFIG = {
  theme: 'dark',
  hasCompletedOnboarding: true,
} as const

const DEFAULT_INTERACTIVE_PROJECT_CONFIG = {
  allowedTools: [],
  mcpContextUris: [],
  enabledMcpjsonServers: [],
  disabledMcpjsonServers: [],
  hasTrustDialogAccepted: true,
  projectOnboardingSeenCount: 0,
  hasClaudeMdExternalIncludesApproved: false,
  hasClaudeMdExternalIncludesWarningShown: false,
} as const

function canExecute(command: string): boolean {
  const result = spawnSync(command, ['-v'], {
    stdio: 'ignore',
  })
  return !result.error && result.status === 0
}

export function detectExpectBinary(): string | null {
  const candidates = [
    process.env.EXPECT_BIN?.trim(),
    '/usr/bin/expect',
    'expect',
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (candidate === 'expect') {
      if (canExecute(candidate)) {
        return candidate
      }
      continue
    }

    if (existsSync(candidate) && canExecute(candidate)) {
      return candidate
    }
  }

  return null
}

function sanitizeTerminalOutput(content: string): string {
  return stripAnsi(content)
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '\n')
    .replace(/\u0008/g, '')
    .replace(/\u0000/g, '')
}

export async function seedInteractiveRuntimeState(
  homeDir: string,
  options?: {
    cwd?: string
  },
): Promise<void> {
  const cwd = options?.cwd ?? REPO_ROOT
  const configPath = join(homeDir, '.klaudia.json')
  const config = {
    ...DEFAULT_INTERACTIVE_GLOBAL_CONFIG,
    projects: {
      [cwd]: { ...DEFAULT_INTERACTIVE_PROJECT_CONFIG },
    },
  }

  await mkdir(homeDir, { recursive: true })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
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

function buildExpectScript(scriptBody: string): string {
  return `#!/usr/bin/expect -f
set timeout $env(KLAUDIA_EXPECT_TIMEOUT_SECONDS)
match_max 100000
log_user 1
log_file -noappend $env(KLAUDIA_TRANSCRIPT_FILE)

proc fail {message} {
  puts stderr $message
  exit 91
}

proc expect_re {pattern} {
  expect {
    -re $pattern { return }
    timeout { fail "Timed out waiting for pattern: $pattern" }
    eof { fail "Process exited while waiting for pattern: $pattern" }
  }
}

proc expect_text {text} {
  expect {
    -exact $text { return }
    timeout { fail "Timed out waiting for text: $text" }
    eof { fail "Process exited while waiting for text: $text" }
  }
}

proc expect_prompt {} { expect_re {❯} }
proc expect_repl_ready {} { expect_re {[?].*shortcuts} }

proc expect_eof {} {
  expect {
    eof { return }
    timeout { fail "Timed out waiting for process exit" }
  }
}

proc send_line {text} { send -- "$text\\r" }
proc send_text {text} { send -- "$text" }
proc send_enter {} { send -- "\\r" }
proc send_arrow_up {} { send -- "\\033\\[A" }
proc send_arrow_down {} { send -- "\\033\\[B" }
proc send_escape {} { send -- "\\033" }
proc send_ctrl_c {} { send -- "\\003" }
proc wait_ms {ms} { after $ms }
proc terminate_session {} {
  global timeout
  set previous_timeout $timeout
  catch {exec kill -TERM [exp_pid]}
  set timeout 5
  expect {
    eof {
      set timeout $previous_timeout
      catch {wait}
      return
    }
    timeout {
      catch {exec kill -KILL [exp_pid]}
      set timeout $previous_timeout
      catch {wait}
      return
    }
  }
}
proc complete_first_run_setup {} {
  expect_re {Theme}
  send_line ""
  expect_re {Press Enter to continue}
  send_line ""
  expect_re {Yes, I trust this folder}
  send_line ""
  expect_repl_ready
}

set cmd [list $env(KLAUDIA_NODE_BINARY) $env(KLAUDIA_RUN_BUN_SCRIPT) $env(KLAUDIA_CLI_ENTRYPOINT) --debug-file $env(KLAUDIA_DEBUG_FILE)]
for {set i 0} {$i < $env(KLAUDIA_CLI_ARG_COUNT)} {incr i} {
  set key "KLAUDIA_CLI_ARG_$i"
  lappend cmd $env($key)
}

spawn -noecho {*}$cmd

${scriptBody}
`
}

export async function runInteractiveCliSession(
  options: InteractiveRuntimeOptions,
): Promise<InteractiveRuntimeResult> {
  const expectBinary = detectExpectBinary()
  if (!expectBinary) {
    throw new Error(
      'Unable to locate an expect binary. Install expect or set EXPECT_BIN.',
    )
  }

  const timeoutMs = options.timeoutMs ?? 60_000
  const { env, homeDir, traceFile } = await createRuntimeEnv({
    safeMode: false,
    traceOnly: true,
    ...options,
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
      CODEX_AUTH_STORAGE_MODE: 'file',
      ...options.env,
    },
  })

  if (env.CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS === undefined) {
    env.CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS = '1'
  }

  const transcriptFile = join(homeDir, 'interactive-transcript.txt')
  const debugFile = join(homeDir, 'interactive-debug.txt')
  const expectScriptFile = join(homeDir, 'interactive-session.expect')

  env.KLAUDIA_EXPECT_TIMEOUT_SECONDS = String(
    Math.max(1, Math.ceil(timeoutMs / 1000)),
  )
  env.KLAUDIA_NODE_BINARY = NODE_BINARY
  env.KLAUDIA_RUN_BUN_SCRIPT = RUN_BUN_SCRIPT
  env.KLAUDIA_CLI_ENTRYPOINT = CLI_ENTRYPOINT
  env.KLAUDIA_TRANSCRIPT_FILE = transcriptFile
  env.KLAUDIA_DEBUG_FILE = debugFile
  env.KLAUDIA_CLI_ARG_COUNT = String(options.args?.length ?? 0)

  for (const [index, arg] of (options.args ?? []).entries()) {
    env[`KLAUDIA_CLI_ARG_${index}`] = arg
  }

  await writeFile(expectScriptFile, buildExpectScript(options.scriptBody), 'utf8')

  return await new Promise(resolvePromise => {
    const child = spawn(expectBinary, [expectScriptFile], {
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

      const [traceEvents, transcript, debugLog] = await Promise.all([
        readTraceEvents(traceFile),
        existsSync(transcriptFile) ? readFile(transcriptFile, 'utf8') : '',
        existsSync(debugFile) ? readFile(debugFile, 'utf8') : '',
      ])

      const cleanedTranscript = sanitizeTerminalOutput(transcript || stdout)
      const cleanedStdout = sanitizeTerminalOutput(stdout)

      resolvePromise({
        status,
        signal,
        stdout: cleanedStdout,
        stderr,
        error,
        homeDir,
        traceFile,
        traceEvents,
        transcriptFile,
        transcript: cleanedTranscript,
        debugFile,
        debugLog,
      })
    }

    child.on('error', error => {
      void finalize(null, null, error)
    })

    child.on('close', (status, signal) => {
      const timeoutError =
        timedOut && signal
          ? new Error(`Interactive runtime timed out after ${timeoutMs}ms`)
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
    }, timeoutMs + 2_000)
    timeout.unref()
  })
}
