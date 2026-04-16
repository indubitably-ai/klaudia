import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { detectBunBinary } from './bun-path.mjs'

const DEFAULT_OPENAI_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const rootDir = process.cwd()
const bunBinary = detectBunBinary()
const cliEntrypoint = path.join(rootDir, 'src/entrypoints/cli.tsx')
const runBunScript = path.join(rootDir, 'scripts/run-bun.mjs')
const startedAt = new Date().toISOString()

function getRuntimeClientVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
    )
    const version =
      typeof packageJson?.version === 'string' ? packageJson.version : ''
    const match = version.match(/^\d+\.\d+\.\d+/)
    return match?.[0] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const RUNTIME_CLIENT_VERSION = getRuntimeClientVersion()

function fail(message) {
  throw new Error(message)
}

function isTruthy(value) {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function getBackendBaseUrl(env = process.env) {
  return env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL
}

function capitalizeWord(value) {
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value
}

function formatOpenAIModelDisplayName(slug, displayName) {
  if (
    typeof displayName === 'string' &&
    displayName.trim().length > 0 &&
    displayName.trim().toLowerCase() !== slug.trim().toLowerCase()
  ) {
    return displayName
  }

  if (/^gpt-/i.test(slug)) {
    const parts = slug.split('-')
    const [, version = '', ...rest] = parts
    const suffix =
      rest.length > 0 ? `-${rest.map(part => capitalizeWord(part)).join('-')}` : ''
    return `GPT-${version}${suffix}`
  }

  if (/^codex-/i.test(slug)) {
    return slug
      .split('-')
      .filter(part => part.toLowerCase() !== 'latest')
      .map((part, index) =>
        index === 0 ? 'Codex' : capitalizeWord(part.toLowerCase()),
      )
      .join(' ')
  }

  if (/^o\d/i.test(slug)) {
    const [prefix, ...rest] = slug.split('-')
    return [prefix.toUpperCase(), ...rest.map(part => capitalizeWord(part))].join('-')
  }

  return slug
}

function detectExpectBinary() {
  for (const candidate of [process.env.EXPECT_BIN?.trim(), '/usr/bin/expect', 'expect']) {
    if (!candidate) {
      continue
    }

    const result = spawnSync(candidate, ['-v'], {
      stdio: 'ignore',
    })
    if (!result.error && result.status === 0) {
      return candidate
    }
  }

  return null
}

function resolveSourceAuthPath() {
  const candidates = []
  const override = process.env.KLAUDIA_LIVE_CODEX_AUTH_PATH?.trim()
  if (override) {
    candidates.push(path.resolve(override))
  }

  const codexHome = process.env.CODEX_HOME?.trim()
  if (codexHome) {
    candidates.push(path.join(path.resolve(codexHome), 'auth.json'))
  }

  const home = process.env.HOME?.trim()
  if (home) {
    candidates.push(path.join(path.resolve(home), '.codex', 'auth.json'))
  }

  const fallbackHome =
    process.env.USERPROFILE?.trim() ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : null)
  if (fallbackHome) {
    candidates.push(path.join(path.resolve(fallbackHome), '.codex', 'auth.json'))
  }

  for (const candidate of [...new Set(candidates)]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  fail(
    [
      'No source Codex auth.json was found for live interactive certification.',
      'Resolution order:',
      '1. KLAUDIA_LIVE_CODEX_AUTH_PATH',
      '2. ${CODEX_HOME}/auth.json',
      '3. ~/.codex/auth.json',
    ].join('\n'),
  )
}

function buildLiveEnv(homeDir) {
  const env = { ...process.env }

  for (const key of [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'OPENAI_API_KEY',
    'KLAUDIA_CONFIG_DIR',
    'CODEX_HOME',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
  ]) {
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

  const configDir = path.join(homeDir, '.config')
  const cacheDir = path.join(homeDir, '.cache')
  const dataDir = path.join(homeDir, '.local', 'share')

  Object.assign(env, {
    HOME: homeDir,
    KLAUDIA_CONFIG_DIR: path.join(homeDir, '.klaudia'),
    CODEX_HOME: path.join(homeDir, '.codex'),
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    XDG_DATA_HOME: dataDir,
    CLAUDE_CODE_AUTH_STORAGE_MODE: 'file',
    CODEX_AUTH_STORAGE_MODE: 'file',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    NO_COLOR: '1',
  })

  return env
}

function runCli(args, env, timeoutMs = 120_000) {
  if (!bunBinary) {
    fail('Unable to locate a Bun binary. Set BUN_BIN or add Bun to PATH.')
  }

  const result = spawnSync(bunBinary, [cliEntrypoint, ...args], {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  })

  if (result.error) {
    fail(result.error.message)
  }

  if (result.signal) {
    fail(`Command terminated by signal ${result.signal}: claude ${args.join(' ')}`)
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function readImportedAuthState(env) {
  const authPath = path.join(env.KLAUDIA_CONFIG_DIR, 'auth.json')
  if (!existsSync(authPath)) {
    fail(`Expected imported Klaudia auth at ${authPath}`)
  }

  let raw
  try {
    raw = JSON.parse(readFileSync(authPath, 'utf8'))
  } catch (error) {
    fail(
      `Unable to parse imported Klaudia auth.json: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const accessToken = raw?.tokens?.access_token
  const accountId = raw?.tokens?.account_id
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    fail('Imported Klaudia auth did not contain an access_token.')
  }

  return {
    accessToken,
    accountId: typeof accountId === 'string' && accountId.trim().length > 0 ? accountId : null,
  }
}

function buildOpenAIHeaders(env, auth, extraHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Client-Request-Id': randomUUID(),
    ...extraHeaders,
  }

  if (auth.accountId) {
    headers['ChatGPT-Account-ID'] = auth.accountId
  }

  const organization = env.OPENAI_ORGANIZATION?.trim()
  if (organization) {
    headers['OpenAI-Organization'] = organization
  }

  const project = env.OPENAI_PROJECT?.trim()
  if (project) {
    headers['OpenAI-Project'] = project
  }

  return headers
}

async function fetchVisibleLiveModels(env) {
  const auth = readImportedAuthState(env)
  const response = await fetch(
    `${getBackendBaseUrl(env)}/models?client_version=${encodeURIComponent(RUNTIME_CLIENT_VERSION)}`,
    {
      method: 'GET',
      headers: buildOpenAIHeaders(env, auth, {
        Accept: 'application/json',
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    fail(
      `Live /models fetch failed (${response.status}): ${body || response.statusText}`.trim(),
    )
  }

  const payload = await response.json()
  if (!Array.isArray(payload?.models)) {
    fail('Live /models payload did not contain a models array.')
  }

  const visibleModels = payload.models
    .filter(
      model =>
        typeof model?.slug === 'string' &&
        model.supported_in_api === true &&
        model.visibility === 'list',
    )
    .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0))
    .map(model => ({
      slug: model.slug,
      displayName: formatOpenAIModelDisplayName(
        model.slug,
        model.display_name,
      ),
    }))

  if (visibleModels.length === 0) {
    fail('Live /models returned no picker-visible API-supported models.')
  }

  return visibleModels
}

function escapeExpectRegex(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function buildExpectScript({ firstModel, secondModel }) {
  const firstDisplayName = escapeExpectRegex(firstModel.displayName)
  const secondDisplayName = escapeExpectRegex(secondModel.displayName)

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

proc expect_eof {} {
  expect {
    eof { return }
    timeout { fail "Timed out waiting for process exit" }
  }
}

proc send_line {text} { send -- "$text\\r" }
proc send_enter {} { send -- "\\r" }
proc send_arrow_up {} { send -- "\\033\\[A" }
proc send_arrow_down {} { send -- "\\033\\[B" }
proc wait_ms {ms} { after $ms }
proc expect_repl_ready {} {
  expect {
    -re {[?].*shortcuts} { return }
    -re {❯} { return }
    timeout { fail "Timed out waiting for the interactive prompt" }
    eof { fail "Process exited before the interactive prompt appeared" }
  }
}

set cmd [list $env(KLAUDIA_NODE_BINARY) $env(KLAUDIA_RUN_BUN_SCRIPT) $env(KLAUDIA_CLI_ENTRYPOINT) --debug-file $env(KLAUDIA_DEBUG_FILE)]
spawn -noecho {*}$cmd

expect_repl_ready
send_line "/model status"
expect_re {Current model: ${firstDisplayName}}
wait_ms 400
send_line "/model ${secondModel.slug}"
wait_ms 1000
expect_repl_ready
send_line "/model status"
expect_re {Current model: ${secondDisplayName}}
wait_ms 400
send_line "Return exactly LIVE-INTERACTIVE-SECOND and nothing else."
expect_re {LIVE-INTERACTIVE-SECOND}
wait_ms 1500
send_line "/model ${firstModel.slug}"
wait_ms 1000
expect_repl_ready
send_line "/model status"
expect_re {Current model: ${firstDisplayName}}
wait_ms 400
send_line "Return exactly LIVE-INTERACTIVE-FIRST and nothing else."
expect_re {LIVE-INTERACTIVE-FIRST}
wait_ms 1500
send_line "/exit"
expect_eof
`
}

async function main() {
  if (!isTruthy(process.env.KLAUDIA_ENABLE_OPENAI_LIVE)) {
    fail(
      'Refusing to run live OpenAI interactive certification without explicit opt-in. Set KLAUDIA_ENABLE_OPENAI_LIVE=1 and rerun `npm run verify:openai-live-interactive`.',
    )
  }

  if (!bunBinary) {
    fail('Unable to locate a Bun binary. Set BUN_BIN or add Bun to PATH.')
  }

  const expectBinary = detectExpectBinary()
  if (!expectBinary) {
    fail(
      'Unable to locate an expect binary for live interactive certification. Install expect or set EXPECT_BIN.',
    )
  }

  const sourceAuthPath = resolveSourceAuthPath()
  const disposableHome = mkdtempSync(
    path.join(tmpdir(), 'klaudia-openai-live-interactive-'),
  )
  const env = buildLiveEnv(disposableHome)
  const disposableCodexAuthPath = path.join(env.CODEX_HOME, 'auth.json')

  mkdirSync(env.KLAUDIA_CONFIG_DIR, { recursive: true })
  mkdirSync(env.CODEX_HOME, { recursive: true })
  mkdirSync(env.XDG_CONFIG_HOME, { recursive: true })
  mkdirSync(env.XDG_CACHE_HOME, { recursive: true })
  mkdirSync(env.XDG_DATA_HOME, { recursive: true })
  copyFileSync(sourceAuthPath, disposableCodexAuthPath)

  const transcriptFile = path.join(disposableHome, 'interactive-transcript.txt')
  const debugFile = path.join(disposableHome, 'interactive-debug.txt')
  const expectScriptFile = path.join(disposableHome, 'interactive-live.expect')

  env.KLAUDIA_EXPECT_TIMEOUT_SECONDS = '120'
  env.KLAUDIA_NODE_BINARY = process.execPath
  env.KLAUDIA_RUN_BUN_SCRIPT = runBunScript
  env.KLAUDIA_CLI_ENTRYPOINT = cliEntrypoint
  env.KLAUDIA_TRANSCRIPT_FILE = transcriptFile
  env.KLAUDIA_DEBUG_FILE = debugFile

  console.log(`source_auth=${sourceAuthPath}`)
  console.log(`target_backend=${getBackendBaseUrl(process.env)}`)

  try {
    const login = runCli(['auth', 'import-codex'], env)
    if (login.stderr !== '') {
      fail(`klaudia auth import-codex wrote to stderr:\n${login.stderr}`)
    }
    if (login.status !== 0) {
      fail(
        `klaudia auth import-codex failed after copying ${sourceAuthPath} into ${disposableCodexAuthPath}.\n${login.stdout || login.stderr}`.trim(),
      )
    }

    const status = runCli(['auth', 'status', '--json'], env)
    if (status.stderr !== '') {
      fail(`klaudia auth status --json wrote to stderr:\n${status.stderr}`)
    }

    let statusPayload
    try {
      statusPayload = JSON.parse(status.stdout)
    } catch (error) {
      fail(
        `Unable to parse klaudia auth status --json output: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    if (status.status !== 0 || statusPayload?.loggedIn !== true) {
      fail(
        'Imported auth is missing or expired in the disposable home. Refresh your Codex login and rerun live interactive certification.',
      )
    }

    const visibleModels = await fetchVisibleLiveModels(env)
    if (visibleModels.length < 2) {
      fail(
        `Live interactive certification requires at least 2 picker-visible models, but only ${visibleModels.length} were returned.`,
      )
    }

    const [firstModel, secondModel] = visibleModels
    console.log(`live_models=${visibleModels.map(model => model.slug).join(',')}`)
    console.log(`interactive_pair=${firstModel.slug},${secondModel.slug}`)

    writeFileSync(
      expectScriptFile,
      buildExpectScript({ firstModel, secondModel }),
      'utf8',
    )

    const interactive = spawnSync(expectBinary, [expectScriptFile], {
      cwd: rootDir,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    })

    if (interactive.error) {
      fail(interactive.error.message)
    }

    if (interactive.signal) {
      fail(`Live interactive certification terminated by signal ${interactive.signal}`)
    }

    if ((interactive.status ?? 1) !== 0) {
      fail(
        [
          'Interactive TUI live certification failed.',
          interactive.stdout?.trim(),
          interactive.stderr?.trim(),
          existsSync(transcriptFile) ? readFileSync(transcriptFile, 'utf8').trim() : '',
          existsSync(debugFile) ? readFileSync(debugFile, 'utf8').trim() : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    }

    const transcript = existsSync(transcriptFile)
      ? readFileSync(transcriptFile, 'utf8')
      : ''
    const debugLog = existsSync(debugFile) ? readFileSync(debugFile, 'utf8') : ''

    if (!transcript.includes('LIVE-INTERACTIVE-SECOND')) {
      fail('Interactive TUI live certification never captured the second-model assistant output.')
    }

    if (!transcript.includes('LIVE-INTERACTIVE-FIRST')) {
      fail('Interactive TUI live certification never captured the first-model assistant output.')
    }

    if (debugLog.includes('MACRO is not defined')) {
      fail('Interactive TUI live certification hit a runtime macro failure.')
    }

    console.log(`PASS verify:openai-live-interactive at ${startedAt}`)
  } finally {
    rmSync(disposableHome, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(`FAIL verify:openai-live-interactive at ${startedAt}`)
  process.exitCode = 1
}
