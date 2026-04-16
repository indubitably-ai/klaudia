import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'

const rootDir = process.cwd()

const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'bunfig.toml',
  'scripts/verify-openai-interactive.mjs',
  'scripts/verify-openai-live.mjs',
  'scripts/verify-openai-live-interactive.mjs',
  'scripts/verify-runtime.mjs',
  'tsconfig.json',
  'test/preload.ts',
  'docs/testing/harness.md',
  'docs/testing/openai-live.md',
  'docs/testing/test-matrix.md',
  'docs/exec-plans/active/testing-harness.md',
  'docs/exec-plans/active/runtime-certification.md',
  'docs/quality/quality-score.md',
]

const requiredDirs = [
  'test',
  'test/support',
  'test/harness',
  'test/shell',
  'test/mcp',
  'test/provider',
  'test/runtime',
  'test/settings',
  'test/supporting',
  'docs/testing',
  'docs/exec-plans/active',
  'docs/quality',
]

const docLinks = new Map([
  [
    'AGENTS.md',
    [
      './ARCHITECTURE.md',
      './docs/testing/harness.md',
      './docs/testing/openai-live.md',
      './docs/testing/test-matrix.md',
      './docs/exec-plans/active/testing-harness.md',
      './docs/exec-plans/active/runtime-certification.md',
      './docs/quality/quality-score.md',
    ],
  ],
  [
    'ARCHITECTURE.md',
    [
      './AGENTS.md',
      './docs/testing/harness.md',
      './docs/testing/openai-live.md',
      './docs/testing/test-matrix.md',
      './docs/exec-plans/active/runtime-certification.md',
      './docs/quality/quality-score.md',
    ],
  ],
  [
    'docs/testing/harness.md',
    [
      '../../AGENTS.md',
      '../../ARCHITECTURE.md',
      './openai-live.md',
      './test-matrix.md',
      '../exec-plans/active/testing-harness.md',
      '../exec-plans/active/runtime-certification.md',
    ],
  ],
  [
    'docs/testing/openai-live.md',
    [
      '../../AGENTS.md',
      '../../ARCHITECTURE.md',
      './harness.md',
      './test-matrix.md',
      '../exec-plans/active/runtime-certification.md',
      '../quality/quality-score.md',
    ],
  ],
  [
    'docs/testing/test-matrix.md',
    [
      './harness.md',
      './openai-live.md',
      '../exec-plans/active/runtime-certification.md',
      '../quality/quality-score.md',
    ],
  ],
  [
    'docs/exec-plans/active/testing-harness.md',
    [
      '../../testing/harness.md',
      '../../testing/openai-live.md',
      '../../testing/test-matrix.md',
      './runtime-certification.md',
    ],
  ],
  [
    'docs/exec-plans/active/runtime-certification.md',
    [
      './testing-harness.md',
      '../../testing/harness.md',
      '../../testing/openai-live.md',
      '../../testing/test-matrix.md',
      '../../quality/quality-score.md',
    ],
  ],
  [
    'docs/quality/quality-score.md',
    [
      '../testing/openai-live.md',
      '../testing/test-matrix.md',
      '../exec-plans/active/testing-harness.md',
      '../exec-plans/active/runtime-certification.md',
    ],
  ],
])

async function assertPathExists(relativePath, kind) {
  const fullPath = path.join(rootDir, relativePath)
  let info

  try {
    info = await stat(fullPath)
  } catch {
    throw new Error(`Missing ${kind}: ${relativePath}`)
  }

  if (kind === 'directory' && !info.isDirectory()) {
    throw new Error(`Expected directory but found something else: ${relativePath}`)
  }

  if (kind === 'file' && !info.isFile()) {
    throw new Error(`Expected file but found something else: ${relativePath}`)
  }
}

async function read(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8')
}

function parseMatrixSuites(markdown) {
  const rows = markdown
    .split('\n')
    .filter(line => line.startsWith('|') && !line.includes('---'))
    .slice(1)

  const matrix = new Map()

  for (const row of rows) {
    const columns = row
      .split('|')
      .slice(1, -1)
      .map(part => part.trim())

    if (columns.length < 4) {
      continue
    }

    const [subsystem, suites] = columns
    const suitePaths = suites
      .split(',')
      .map(value => value.replaceAll('`', '').trim())
      .filter(Boolean)

    matrix.set(subsystem, suitePaths)
  }

  return matrix
}

async function collectTestFiles(relativeDir) {
  const fullDir = path.join(rootDir, relativeDir)
  const entries = await readdir(fullDir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const childRelative = path.posix.join(
      relativeDir.replaceAll(path.sep, '/'),
      entry.name,
    )
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(childRelative)))
      continue
    }
    if (entry.isFile() && childRelative.endsWith('.test.ts')) {
      files.push(childRelative)
    }
  }

  return files
}

async function verifyDocs() {
  for (const file of requiredFiles) {
    await assertPathExists(file, 'file')
  }

  for (const dir of requiredDirs) {
    await assertPathExists(dir, 'directory')
  }

  for (const [file, links] of docLinks.entries()) {
    const content = await read(file)
    for (const link of links) {
      if (!content.includes(link)) {
        throw new Error(`Missing cross-link in ${file}: ${link}`)
      }
    }
  }
}

async function verifyMatrix() {
  const matrixContent = await read('docs/testing/test-matrix.md')
  const matrix = parseMatrixSuites(matrixContent)
  const expectedSubsystems = [
    'Harness',
    'Shell',
    'MCP',
    'Provider',
    'Runtime',
    'Settings',
  ]

  for (const subsystem of expectedSubsystems) {
    if (!matrix.has(subsystem)) {
      throw new Error(`Missing subsystem entry in test matrix: ${subsystem}`)
    }
    if (matrix.get(subsystem).length === 0) {
      throw new Error(`Subsystem has no suites in test matrix: ${subsystem}`)
    }
  }

  const architecture = await read('ARCHITECTURE.md')
  const quality = await read('docs/quality/quality-score.md')
  for (const subsystem of ['Shell', 'MCP', 'Provider', 'Runtime', 'Settings']) {
    if (!architecture.includes(subsystem)) {
      throw new Error(`ARCHITECTURE.md does not cover subsystem: ${subsystem}`)
    }
    if (!quality.includes(subsystem)) {
      throw new Error(`quality-score.md does not cover subsystem: ${subsystem}`)
    }
  }

  const matrixSuites = new Set()
  for (const suitePaths of matrix.values()) {
    for (const suitePath of suitePaths) {
      matrixSuites.add(suitePath)
      await assertPathExists(suitePath, 'file')
      const content = await read(suitePath)
      const declaresTests =
        /\b(?:it|test)\(/.test(content) ||
        /\b(?:describe|it|test)\.(?:serial|concurrent)\(/.test(content) ||
        /\b[A-Za-z]+It\(/.test(content)
      if (!declaresTests) {
        throw new Error(`Suite does not declare tests: ${suitePath}`)
      }
    }
  }

  const discoveredSuites = await collectTestFiles('test')
  for (const suite of discoveredSuites) {
    if (!matrixSuites.has(suite)) {
      throw new Error(`Suite is missing from test matrix: ${suite}`)
    }
  }
}

async function main() {
  await verifyDocs()
  await verifyMatrix()
  console.log('Harness structure verified')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
