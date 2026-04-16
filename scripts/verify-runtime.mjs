import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detectBunBinary } from './bun-path.mjs'

const rootDir = process.cwd()
const bunBinary = detectBunBinary()

const safeBootCases = [
  { args: ['--version'], output: /\(Klaudia\)/ },
  { args: ['--help'], output: /Usage:/ },
  { args: ['--bare', '--help'], output: /Usage:/ },
  { args: ['mcp', '--help'], output: /Usage:/ },
  { args: ['plugin', '--help'], output: /Usage:/ },
  { args: ['doctor', '--help'], output: /Usage:/ },
  { args: ['update', '--help'], output: /Usage:/ },
]

const runtimeAssetModules = ['src/skills/bundled/verifyContent.ts']
const safeRuntimeFiles = [
  'src/entrypoints/cli.tsx',
  'src/main.tsx',
  'src/commands/version.ts',
]

function scrubEnv(source) {
  const env = { ...source }
  for (const key of [
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

  return env
}

async function assertPathExists(relativePath) {
  await stat(path.join(rootDir, relativePath))
}

function parseTextImports(source) {
  return [...source.matchAll(/from ['"](.+\.(?:md|txt|json))['"]/g)].map(
    match => match[1],
  )
}

async function verifyBundledAssets() {
  for (const modulePath of runtimeAssetModules) {
    await assertPathExists(modulePath)
    const content = await readFile(path.join(rootDir, modulePath), 'utf8')
    const imports = parseTextImports(content)
    if (imports.length === 0) {
      throw new Error(`Runtime asset module has no text imports: ${modulePath}`)
    }

    for (const assetImport of imports) {
      const assetPath = path.resolve(path.dirname(path.join(rootDir, modulePath)), assetImport)
      if (!existsSync(assetPath)) {
        throw new Error(`Missing runtime asset import: ${path.relative(rootDir, assetPath)}`)
      }
    }
  }
}

async function verifyMacroGuards() {
  for (const file of safeRuntimeFiles) {
    await assertPathExists(file)
    const content = await readFile(path.join(rootDir, file), 'utf8')
    if (content.includes('MACRO.')) {
      throw new Error(`Safe runtime file still references MACRO directly: ${file}`)
    }
  }
}

async function readTraceEvents(traceFile) {
  if (!existsSync(traceFile)) {
    return []
  }

  const content = await readFile(traceFile, 'utf8')
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

async function runSafeBootMatrix() {
  if (!bunBinary) {
    throw new Error('Unable to locate a Bun binary. Set BUN_BIN or add Bun to PATH.')
  }

  for (const testCase of safeBootCases) {
    const homeDir = await mkdtemp(path.join(tmpdir(), 'klaudia-runtime-'))
    const configDir = path.join(homeDir, '.config')
    const cacheDir = path.join(homeDir, '.cache')
    const dataDir = path.join(homeDir, '.local', 'share')
    const traceFile = path.join(homeDir, 'startup-trace.jsonl')

    await mkdir(configDir, { recursive: true })
    await mkdir(cacheDir, { recursive: true })
    await mkdir(dataDir, { recursive: true })

    const env = scrubEnv(process.env)
    Object.assign(env, {
      HOME: homeDir,
      XDG_CONFIG_HOME: configDir,
      XDG_CACHE_HOME: cacheDir,
      XDG_DATA_HOME: dataDir,
      NO_COLOR: '1',
      TZ: 'UTC',
      CI: '1',
      BUN_BIN: bunBinary,
      CLAUDE_CODE_SIMPLE: '1',
      CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS: '1',
      CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_ONLY: '1',
      CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_FILE: traceFile,
    })

    const result = spawnSync(
      process.execPath,
      [
        path.join(rootDir, 'scripts/run-bun.mjs'),
        'src/entrypoints/cli.tsx',
        ...testCase.args,
      ],
      {
        cwd: rootDir,
        env,
        encoding: 'utf8',
        timeout: 20_000,
      },
    )

    if (result.error) {
      throw result.error
    }

    if (result.signal) {
      throw new Error(
        `Runtime smoke was terminated for ${testCase.args.join(' ')}: ${result.signal}`,
      )
    }

    if (result.status !== 0) {
      throw new Error(
        `Runtime smoke failed for ${testCase.args.join(' ')}:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
      )
    }

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    if (!testCase.output.test(output)) {
      throw new Error(
        `Runtime smoke output mismatch for ${testCase.args.join(' ')}:\n${output}`.trim(),
      )
    }

    const traceEvents = await readTraceEvents(traceFile)
    if (traceEvents.length > 0) {
      throw new Error(
        `Safe runtime smoke unexpectedly triggered startup side effects for ${testCase.args.join(' ')}`,
      )
    }
  }
}

async function main() {
  await verifyBundledAssets()
  await verifyMacroGuards()
  await runSafeBootMatrix()

  const interactiveResult = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts/verify-openai-interactive.mjs')],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    },
  )

  if (interactiveResult.error) {
    throw interactiveResult.error
  }

  if ((interactiveResult.status ?? 1) !== 0) {
    throw new Error('Interactive OpenAI runtime verification failed')
  }

  console.log('Runtime verification passed')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
