import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { detectBunBinary } from './bun-path.mjs'

const bunBinary = detectBunBinary()

if (!bunBinary) {
  console.error('Unable to locate a Bun binary. Set BUN_BIN or add Bun to PATH.')
  process.exit(1)
}

const result = spawnSync(bunBinary, process.argv.slice(2), {
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
