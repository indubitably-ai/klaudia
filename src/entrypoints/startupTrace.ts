import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

function isEnvTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getTraceFilePath(): string | null {
  const traceFile = process.env.CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_FILE?.trim()
  return traceFile ? traceFile : null
}

export function shouldTraceStartupSideEffectsOnly(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_ONLY)
}

export function recordStartupTraceEvent(
  type: string,
  details: Record<string, unknown> = {},
): void {
  const traceFile = getTraceFilePath()
  if (!traceFile) {
    return
  }

  mkdirSync(dirname(traceFile), { recursive: true })
  appendFileSync(
    traceFile,
    `${JSON.stringify({
      type,
      pid: process.pid,
      platform: process.platform,
      ...details,
    })}\n`,
    'utf8',
  )
}
