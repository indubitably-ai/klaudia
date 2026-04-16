import { spawnSync } from 'node:child_process'
import process from 'node:process'
import path from 'node:path'
import { detectBunBinary } from './bun-path.mjs'

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

const bunBinary = detectBunBinary()
const expectBinary = detectExpectBinary()
const interactiveCases = [
  'boots the source-run REPL',
  'renders /help and /status overlays',
  'accepts a direct visible OpenAI model id',
  'accepts a direct raw OpenAI model id',
  'replays the prior assistant turn',
]

if (!bunBinary) {
  console.error('Unable to locate a Bun binary. Set BUN_BIN or add Bun to PATH.')
  process.exit(1)
}

if (!expectBinary) {
  console.error(
    'Unable to locate an expect binary for interactive PTY verification. Install expect or set EXPECT_BIN.',
  )
  process.exit(1)
}

for (const pattern of interactiveCases) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), 'scripts/run-bun.mjs'),
      'test',
      'test/runtime/openaiInteractiveTui.test.ts',
      '--test-name-pattern',
      pattern,
      '--max-concurrency',
      '1',
      '--timeout',
      '180000',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        BUN_BIN: bunBinary,
      },
    },
  )

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}
