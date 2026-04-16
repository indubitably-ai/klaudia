type RuntimeMacroValue = string | undefined

export type RuntimeMacroShape = {
  VERSION?: RuntimeMacroValue
  BUILD_TIME?: RuntimeMacroValue
  PACKAGE_URL?: RuntimeMacroValue
  NATIVE_PACKAGE_URL?: RuntimeMacroValue
  VERSION_CHANGELOG?: RuntimeMacroValue
  FEEDBACK_CHANNEL?: RuntimeMacroValue
  ISSUES_EXPLAINER?: RuntimeMacroValue
}

declare global {
  var MACRO: RuntimeMacroShape | undefined
}

declare const MACRO: RuntimeMacroShape | undefined

const SOURCE_RUNTIME_MACRO_FALLBACK: Required<
  Omit<RuntimeMacroShape, 'BUILD_TIME'>
> &
  Pick<RuntimeMacroShape, 'BUILD_TIME'> = {
  VERSION: '0.0.0-source',
  BUILD_TIME: undefined,
  PACKAGE_URL: '@anthropic-ai/claude-code',
  NATIVE_PACKAGE_URL: '@anthropic-ai/claude-code-native',
  VERSION_CHANGELOG: '',
  FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/discussions',
  ISSUES_EXPLAINER: 'https://github.com/anthropics/claude-code/issues',
}

function readDeclaredRuntimeMacro(): RuntimeMacroShape | undefined {
  return typeof MACRO !== 'undefined' ? MACRO : undefined
}

export function getInstalledRuntimeMacro():
  | RuntimeMacroShape
  | undefined {
  return readDeclaredRuntimeMacro() ?? globalThis.MACRO
}

export function getRuntimeMacroFallback(): RuntimeMacroShape {
  return { ...SOURCE_RUNTIME_MACRO_FALLBACK }
}

export function installRuntimeMacroFallback(): RuntimeMacroShape {
  const existing = getInstalledRuntimeMacro()
  const next = {
    ...SOURCE_RUNTIME_MACRO_FALLBACK,
    ...existing,
  }
  globalThis.MACRO = next
  return next
}

function getRuntimeMacroValue<K extends keyof RuntimeMacroShape>(
  key: K,
): RuntimeMacroShape[K] {
  const installed = getInstalledRuntimeMacro()
  const installedValue = installed?.[key]
  if (installedValue !== undefined) {
    return installedValue
  }
  return SOURCE_RUNTIME_MACRO_FALLBACK[key]
}

export function getRuntimePackageUrl(): string {
  return (
    getRuntimeMacroValue('PACKAGE_URL') ??
    SOURCE_RUNTIME_MACRO_FALLBACK.PACKAGE_URL
  )
}

export function getRuntimeNativePackageUrl(): string {
  return (
    getRuntimeMacroValue('NATIVE_PACKAGE_URL') ??
    SOURCE_RUNTIME_MACRO_FALLBACK.NATIVE_PACKAGE_URL
  )
}

export function getRuntimeVersionChangelog(): string {
  return (
    getRuntimeMacroValue('VERSION_CHANGELOG') ??
    SOURCE_RUNTIME_MACRO_FALLBACK.VERSION_CHANGELOG
  )
}

export function getRuntimeFeedbackChannel(): string {
  return (
    getRuntimeMacroValue('FEEDBACK_CHANNEL') ??
    SOURCE_RUNTIME_MACRO_FALLBACK.FEEDBACK_CHANNEL
  )
}

export function getRuntimeIssuesExplainer(): string {
  return (
    getRuntimeMacroValue('ISSUES_EXPLAINER') ??
    SOURCE_RUNTIME_MACRO_FALLBACK.ISSUES_EXPLAINER
  )
}
