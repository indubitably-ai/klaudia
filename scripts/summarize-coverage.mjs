#!/usr/bin/env node

import { readFileSync } from 'fs'
import { resolve } from 'path'

const COVERAGE_GROUPS = [
  {
    name: 'Provider',
    files: ['src/provider/providerSession.ts'],
  },
  {
    name: 'Runtime',
    files: [
      'src/entrypoints/startupSideEffects.ts',
      'src/utils/runtimeVersion.ts',
    ],
  },
  {
    name: 'Shell',
    files: [
      'src/tools/BashTool/sedValidation.ts',
      'src/tools/BashTool/bashPermissions.ts',
      'src/tools/BashTool/pathValidation.ts',
    ],
  },
  {
    name: 'MCP',
    files: [
      'src/services/mcp/config.ts',
      'src/services/mcp/envExpansion.ts',
      'src/services/mcp/types.ts',
    ],
  },
  {
    name: 'Settings',
    files: [
      'src/utils/xdg.ts',
      'src/utils/shellConfig.ts',
      'src/utils/settings/settingsCache.ts',
      'src/utils/settings/changeDetector.ts',
      'src/utils/settings/managedPath.ts',
      'src/utils/settings/internalWrites.ts',
    ],
  },
  {
    name: 'Supporting',
    files: ['src/utils/frontmatterParser.ts'],
  },
]

function parseLcov(lcovText) {
  const records = new Map()
  let current = null

  for (const rawLine of lcovText.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('SF:')) {
      current = {
        file: line.slice(3),
        linesFound: 0,
        linesHit: 0,
        funcsFound: 0,
        funcsHit: 0,
      }
      continue
    }

    if (!current) continue

    if (line.startsWith('LF:')) {
      current.linesFound = Number(line.slice(3))
      continue
    }

    if (line.startsWith('LH:')) {
      current.linesHit = Number(line.slice(3))
      continue
    }

    if (line.startsWith('FNF:')) {
      current.funcsFound = Number(line.slice(4))
      continue
    }

    if (line.startsWith('FNH:')) {
      current.funcsHit = Number(line.slice(4))
      continue
    }

    if (line === 'end_of_record') {
      records.set(current.file, current)
      current = null
    }
  }

  return records
}

function formatPercent(hit, found) {
  if (found === 0) return 'n/a'
  return `${((hit / found) * 100).toFixed(2)}%`
}

function summarizeGroup(records, group) {
  const matched = group.files
    .map(file => records.get(file))
    .filter(Boolean)

  if (matched.length !== group.files.length) {
    const missing = group.files.filter(file => !records.has(file))
    throw new Error(
      `Coverage report is missing expected files for ${group.name}: ${missing.join(', ')}`,
    )
  }

  const totals = matched.reduce(
    (acc, record) => ({
      linesFound: acc.linesFound + record.linesFound,
      linesHit: acc.linesHit + record.linesHit,
      funcsFound: acc.funcsFound + record.funcsFound,
      funcsHit: acc.funcsHit + record.funcsHit,
    }),
    { linesFound: 0, linesHit: 0, funcsFound: 0, funcsHit: 0 },
  )

  return {
    ...group,
    ...totals,
  }
}

const coveragePath = resolve(process.argv[2] ?? '.coverage/bun/lcov.info')
const records = parseLcov(readFileSync(coveragePath, 'utf8'))
const summaries = COVERAGE_GROUPS.map(group => summarizeGroup(records, group))

const overall = summaries.reduce(
  (acc, summary) => ({
    linesFound: acc.linesFound + summary.linesFound,
    linesHit: acc.linesHit + summary.linesHit,
    funcsFound: acc.funcsFound + summary.funcsFound,
    funcsHit: acc.funcsHit + summary.funcsHit,
  }),
  { linesFound: 0, linesHit: 0, funcsFound: 0, funcsHit: 0 },
)

console.log('Harness coverage summary')
for (const summary of summaries) {
  console.log(
    `- ${summary.name}: ${formatPercent(summary.linesHit, summary.linesFound)} lines, ${formatPercent(summary.funcsHit, summary.funcsFound)} funcs (${summary.files.length} files)`,
  )
}
console.log(
  `- Focus total: ${formatPercent(overall.linesHit, overall.linesFound)} lines, ${formatPercent(overall.funcsHit, overall.funcsFound)} funcs`,
)
