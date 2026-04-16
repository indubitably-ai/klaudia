import { getInstalledRuntimeMacro } from './runtimeMacros.js'

export function getRuntimeVersion(): string {
  return getInstalledRuntimeMacro()?.VERSION ?? 'unknown'
}

export function getRuntimeVersionForBackend(): string {
  const version = getRuntimeVersion()
  const match = version.match(/^\d+\.\d+\.\d+/)
  return match?.[0] ?? '0.0.0'
}

export function getRuntimeBuildTime(): string | undefined {
  return getInstalledRuntimeMacro()?.BUILD_TIME
}
