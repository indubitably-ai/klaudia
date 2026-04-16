type EnvPatch = Record<string, string | undefined>

const baselineEnv = new Map<string, string | undefined>(
  Object.entries(process.env),
)

export function applyHarnessDefaults(): void {
  process.env.CLAUDE_CODE_SIMPLE = '1'
  process.env.NO_COLOR = '1'
  process.env.TZ = 'UTC'
}

export function patchEnv(overrides: EnvPatch): () => void {
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!baselineEnv.has(key)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of baselineEnv.entries()) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
