import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { detectBunBinary } from './bun-path.mjs'

const DEFAULT_OPENAI_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const rootDir = process.cwd()
const bunBinary = detectBunBinary()
const cliEntrypoint = path.join(rootDir, 'src/entrypoints/cli.tsx')
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

const liveCases = [
  {
    name: 'single_line',
    prompt:
      'Return exactly this text and nothing else: PARSE-ONE: A_B-C.123 [] {} ()',
    expected: 'PARSE-ONE: A_B-C.123 [] {} ()',
  },
  {
    name: 'multiline',
    prompt:
      'Return exactly these three lines and nothing else:\nfirst line\nsecond line\nthird line',
    expected: 'first line\nsecond line\nthird line',
  },
  {
    name: 'json_text',
    prompt:
      'Return exactly this JSON text as plain text, with no code fence or extra commentary: {"status":"ok","items":[1,2,3],"note":"parse-check"}',
    expected: '{"status":"ok","items":[1,2,3],"note":"parse-check"}',
  },
]

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

  const deduped = [...new Set(candidates)]
  for (const candidate of deduped) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  fail(
    [
      'No source Codex auth.json was found for live certification.',
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

function parseNdjson(stdout, caseName) {
  const lines = stdout
    .trimEnd()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length !== 3) {
    fail(
      `Case ${caseName}: expected exactly 3 NDJSON records, received ${lines.length}.`,
    )
  }

  return lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      fail(
        `Case ${caseName}: malformed NDJSON record ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}

function extractAssistantText(message) {
  const content = Array.isArray(message?.message?.content)
    ? message.message.content
    : []

  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

function isAuthFailure(text) {
  return /(not logged in|auth login|auth import-codex|subscription token|401|403|unauthorized|forbidden)/i.test(
    text,
  )
}

function validateCaseOutput(testCase, stdout, stderr, expectedModel) {
  if (stderr !== '') {
    fail(`Case ${testCase.name}: stderr was not empty:\n${stderr}`)
  }

  const [initRecord, assistantRecord, resultRecord] = parseNdjson(
    stdout,
    testCase.name,
  )

  if (
    initRecord?.type !== 'system' ||
    initRecord?.subtype !== 'init' ||
    assistantRecord?.type !== 'assistant' ||
    resultRecord?.type !== 'result'
  ) {
    fail(
      `Case ${testCase.name}: expected record types system/init, assistant, result in order.`,
    )
  }

  if (typeof initRecord?.model !== 'string' || initRecord.model !== expectedModel) {
    fail(
      `Case ${testCase.name}: expected system/init.model ${JSON.stringify(expectedModel)}, received ${JSON.stringify(initRecord?.model)}`,
    )
  }

  const assistantText = extractAssistantText(assistantRecord)
  const resultText =
    typeof resultRecord?.result === 'string' ? resultRecord.result : ''

  if (resultRecord?.is_error === true) {
    const errorText = resultText || assistantText || 'unknown live runtime error'
    if (isAuthFailure(errorText)) {
      fail(
        `Case ${testCase.name}: auth missing or expired after import. ${errorText}`,
      )
    }
    fail(`Case ${testCase.name}: runtime returned an error result. ${errorText}`)
  }

  if (assistantText !== testCase.expected) {
    fail(
      `Case ${testCase.name}: assistant payload mismatch.\nExpected: ${JSON.stringify(testCase.expected)}\nActual:   ${JSON.stringify(assistantText)}`,
    )
  }

  if (resultText !== testCase.expected) {
    fail(
      `Case ${testCase.name}: result payload mismatch.\nExpected: ${JSON.stringify(testCase.expected)}\nActual:   ${JSON.stringify(resultText)}`,
    )
  }
}

function createPerModelCase(model) {
  return {
    name: `model_${model.slug}`,
    prompt: `Return exactly this text and nothing else: MODEL-CHECK:${model.slug}`,
    expected: `MODEL-CHECK:${model.slug}`,
  }
}

async function main() {
  if (!isTruthy(process.env.KLAUDIA_ENABLE_OPENAI_LIVE)) {
    fail(
      'Refusing to run live OpenAI certification without explicit opt-in. Set KLAUDIA_ENABLE_OPENAI_LIVE=1 and rerun `npm run verify:openai-live`.',
    )
  }

  const sourceAuthPath = resolveSourceAuthPath()
  const disposableHome = mkdtempSync(path.join(tmpdir(), 'klaudia-openai-live-'))
  const env = buildLiveEnv(disposableHome)
  const disposableCodexAuthPath = path.join(env.CODEX_HOME, 'auth.json')

  mkdirSync(env.KLAUDIA_CONFIG_DIR, { recursive: true })
  mkdirSync(env.CODEX_HOME, { recursive: true })
  mkdirSync(env.XDG_CONFIG_HOME, { recursive: true })
  mkdirSync(env.XDG_CACHE_HOME, { recursive: true })
  mkdirSync(env.XDG_DATA_HOME, { recursive: true })
  copyFileSync(sourceAuthPath, disposableCodexAuthPath)

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
        'Imported auth is missing or expired in the disposable home. Refresh your Codex login and rerun live certification.',
      )
    }

    const visibleModels = await fetchVisibleLiveModels(env)
    const defaultModel = visibleModels[0].slug
    console.log(`live_models=${visibleModels.map(model => model.slug).join(',')}`)
    console.log(`default_model=${defaultModel}`)

    for (const testCase of liveCases) {
      const result = runCli(
        [
          '--bare',
          '-p',
          testCase.prompt,
          '--output-format',
          'stream-json',
          '--verbose',
        ],
        env,
      )

      if (result.status !== 0 && result.stdout.trim().length === 0) {
        fail(
          `Case ${testCase.name}: claude exited ${result.status} before producing NDJSON output.\n${result.stderr}`.trim(),
        )
      }

      validateCaseOutput(testCase, result.stdout, result.stderr, defaultModel)
      console.log(`PASS ${testCase.name} (${defaultModel})`)
    }

    for (const model of visibleModels) {
      const testCase = createPerModelCase(model)
      const result = runCli(
        [
          '--bare',
          '--model',
          model.slug,
          '-p',
          testCase.prompt,
          '--output-format',
          'stream-json',
          '--verbose',
        ],
        env,
      )

      if (result.status !== 0 && result.stdout.trim().length === 0) {
        fail(
          `Case ${testCase.name}: claude exited ${result.status} before producing NDJSON output.\n${result.stderr}`.trim(),
        )
      }

      validateCaseOutput(testCase, result.stdout, result.stderr, model.slug)
      console.log(`PASS ${testCase.name} (${model.displayName})`)
    }

    console.log(`PASS verify:openai-live at ${startedAt}`)
  } finally {
    rmSync(disposableHome, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(`FAIL verify:openai-live at ${startedAt}`)
  process.exitCode = 1
}
