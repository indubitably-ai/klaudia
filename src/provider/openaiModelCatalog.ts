import isEqual from 'lodash-es/isEqual.js'
import { z } from 'zod'
import {
  readOpenAIAuthState,
  refreshOpenAIAuthStateIfNeeded,
  type OpenAIAuthState,
} from './openaiAuthManager.js'
import {
  isOpenAIRuntime,
  resolveOpenAIModelCatalog,
  type ProviderConfig,
} from './providerRegistry.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import { logForDebugging } from 'src/utils/debug.js'
import { capitalize } from 'src/utils/stringUtils.js'
import { getRuntimeVersionForBackend } from 'src/utils/runtimeVersion.js'
import {
  buildOpenAIRequestHeaders,
  createOpenAIRequestId,
  getOpenAIResponseEtag,
  getUnsupportedOpenAIRuntimeError,
  readOpenAIResponseError,
  resolveOpenAITransportContext,
  type OpenAIFetchLike,
} from 'src/services/api/openai/http.js'
import type { EffortLevel } from 'src/entrypoints/sdk/runtimeTypes.js'

const OPENAI_REASONING_LEVELS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const
const CLIENT_REASONING_LEVELS = ['low', 'medium', 'high', 'max'] as const

function normalizeClientReasoningLevel(
  effort: string | null | undefined,
): EffortLevel | null {
  if (!effort) {
    return null
  }

  const normalized = effort.trim().toLowerCase()
  return (CLIENT_REASONING_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as EffortLevel)
    : null
}

const reasoningPresetSchema = z
  .object({
    effort: z.enum(OPENAI_REASONING_LEVELS),
    description: z.string().nullish(),
  })
  .transform(({ effort, description }) => {
    const normalizedEffort = normalizeClientReasoningLevel(effort)
    return normalizedEffort
      ? {
          effort: normalizedEffort,
          description: description ?? effort,
        }
      : null
  })

const openAIModelCatalogEntrySchema = z
  .object({
    slug: z.string(),
    display_name: z.string(),
    description: z.string().nullish(),
    default_reasoning_level: z.enum(OPENAI_REASONING_LEVELS).nullish(),
    supported_reasoning_levels: z.array(reasoningPresetSchema).default([]),
    visibility: z.string().nullish(),
    supported_in_api: z.boolean().default(true),
    priority: z.number().default(0),
  })
  .transform(
    ({
      slug,
      display_name,
      description,
      default_reasoning_level,
      supported_reasoning_levels,
      visibility,
      supported_in_api,
      priority,
    }) => ({
      slug,
      displayName:
        display_name.trim().toLowerCase() === slug.trim().toLowerCase()
          ? formatOpenAIFallbackName(slug)
          : display_name,
      description: description ?? null,
      defaultReasoningLevel:
        normalizeClientReasoningLevel(default_reasoning_level) ?? null,
      supportedReasoningLevels: supported_reasoning_levels.filter(
        (level): level is NonNullable<typeof level> => level !== null,
      ),
      visibility: visibility ?? 'hide',
      supportedInApi: supported_in_api,
      priority,
    }),
  )

const openAIModelsResponseSchema = z.object({
  models: z.array(openAIModelCatalogEntrySchema),
})

export type OpenAIReasoningLevel = EffortLevel

export type OpenAIModelCatalogEntry = {
  slug: string
  displayName: string
  description: string | null
  defaultReasoningLevel: OpenAIReasoningLevel | null
  supportedReasoningLevels: Array<{
    effort: OpenAIReasoningLevel
    description: string
  }>
  visibility: string
  supportedInApi: boolean
  priority: number
}

export type OpenAIModelCatalogSnapshot = {
  models: OpenAIModelCatalogEntry[]
  etag: string | null
  fetchedAt: string
  clientVersion: string
}

function formatGPTModelId(model: string): string {
  const parts = model.split('-')
  const [, version = '', ...rest] = parts
  const suffix =
    rest.length > 0 ? `-${rest.map(part => capitalize(part)).join('-')}` : ''
  return `GPT-${version}${suffix}`
}

function formatOpenAIFallbackName(model: string): string {
  if (/^gpt-/i.test(model)) {
    return formatGPTModelId(model)
  }

  if (/^codex-/i.test(model)) {
    const parts = model
      .split('-')
      .filter(part => part.toLowerCase() !== 'latest')
      .map((part, index) =>
        index === 0 ? 'Codex' : capitalize(part.toLowerCase()),
      )
    return parts.join(' ')
  }

  if (/^o\d/i.test(model)) {
    const [prefix, ...rest] = model.split('-')
    return [prefix.toUpperCase(), ...rest.map(part => capitalize(part))].join(
      rest.length > 0 ? '-' : '',
    )
  }

  return model
}

export function isOpenAIRawModelId(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return (
    /^gpt-[a-z0-9][a-z0-9.-]*$/.test(normalized) ||
    /^codex-[a-z0-9][a-z0-9.-]*$/.test(normalized) ||
    /^o(?:1|3|4)[a-z0-9.-]*$/.test(normalized)
  )
}

function createFallbackCatalogEntry(
  slug: string,
  priority: number,
): OpenAIModelCatalogEntry {
  return {
    slug,
    displayName: formatOpenAIFallbackName(slug),
    description: null,
    defaultReasoningLevel: null,
    supportedReasoningLevels: [],
    visibility: 'list',
    supportedInApi: true,
    priority,
  }
}

export function getFallbackOpenAIModelCatalogSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIModelCatalogSnapshot {
  const fallback = resolveOpenAIModelCatalog(env)
  const models = [createFallbackCatalogEntry(fallback.defaultModel, 1)]

  if (fallback.smallModel !== fallback.defaultModel) {
    models.push(createFallbackCatalogEntry(fallback.smallModel, 2))
  }

  return {
    models,
    etag: null,
    fetchedAt: new Date(0).toISOString(),
    clientVersion: getRuntimeVersionForBackend(),
  }
}

export function getCachedOpenAIModelCatalogSnapshot():
  | OpenAIModelCatalogSnapshot
  | null {
  return getGlobalConfig().openaiModelCatalogCache ?? null
}

export function getActiveOpenAIModelCatalogSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIModelCatalogSnapshot {
  return getCachedOpenAIModelCatalogSnapshot() ?? getFallbackOpenAIModelCatalogSnapshot(env)
}

export function getVisibleOpenAIModelCatalogEntries(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIModelCatalogEntry[] {
  return [...getActiveOpenAIModelCatalogSnapshot(env).models]
    .filter(entry => entry.supportedInApi && entry.visibility === 'list')
    .sort((a, b) => a.priority - b.priority)
}

export function getDefaultOpenAIModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    getVisibleOpenAIModelCatalogEntries(env)[0]?.slug ??
    resolveOpenAIModelCatalog(env).defaultModel
  )
}

export function findOpenAIModelCatalogEntry(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): OpenAIModelCatalogEntry | null {
  const normalized = model.trim().toLowerCase()
  return (
    getActiveOpenAIModelCatalogSnapshot(env).models.find(
      entry => entry.slug.trim().toLowerCase() === normalized,
    ) ?? null
  )
}

export function getOpenAIModelDisplayName(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const catalogEntry = findOpenAIModelCatalogEntry(model, env)
  if (catalogEntry) {
    return catalogEntry.displayName
  }

  if (model === resolveOpenAIModelCatalog(env).smallModel) {
    return 'Codex Mini'
  }

  if (model === resolveOpenAIModelCatalog(env).defaultModel) {
    return formatOpenAIFallbackName(model)
  }

  if (isOpenAIRawModelId(model)) {
    return formatOpenAIFallbackName(model)
  }

  return null
}

export function getOpenAIModelReasoningMetadata(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): {
  defaultReasoningLevel: OpenAIReasoningLevel | null
  supportedReasoningLevels: OpenAIReasoningLevel[]
} | null {
  const entry = findOpenAIModelCatalogEntry(model, env)
  if (!entry) {
    return null
  }

  return {
    defaultReasoningLevel: entry.defaultReasoningLevel,
    supportedReasoningLevels: [
      ...new Set(entry.supportedReasoningLevels.map(level => level.effort)),
    ],
  }
}

export function isKnownOpenAIModel(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(findOpenAIModelCatalogEntry(model, env)) || isOpenAIRawModelId(model)
}

export async function fetchOpenAIModelCatalog(
  options: {
    auth: OpenAIAuthState
    env?: NodeJS.ProcessEnv
    provider?: ProviderConfig
    fetchImpl?: OpenAIFetchLike
    signal?: AbortSignal
    ifNoneMatch?: string | null
  },
): Promise<
  | { status: 'not_modified' }
  | { status: 'ok'; snapshot: OpenAIModelCatalogSnapshot }
> {
  const {
    env,
    provider,
    fetchImpl,
  } = resolveOpenAITransportContext(
    options.env ?? process.env,
    options.provider,
    options.fetchImpl,
  )
  const unsupported = getUnsupportedOpenAIRuntimeError(env)
  if (unsupported) {
    throw unsupported
  }

  const runtimeVersion = getRuntimeVersionForBackend()
  const requestId = createOpenAIRequestId()
  const response = await fetchImpl(
    `${provider.baseUrl}/models?client_version=${encodeURIComponent(runtimeVersion)}`,
    {
      method: 'GET',
      headers: buildOpenAIRequestHeaders(provider, options.auth, requestId, {
        accept: 'application/json',
        ifNoneMatch: options.ifNoneMatch,
      }),
      signal: options.signal,
    },
  )

  if (response.status === 304) {
    return { status: 'not_modified' }
  }

  if (!response.ok) {
    throw await readOpenAIResponseError(response, 'models request')
  }

  const rawPayload = (await response.json()) as unknown
  const parsed = openAIModelsResponseSchema.safeParse(rawPayload)
  if (!parsed.success) {
    throw new Error(
      `OpenAI models response failed validation: ${parsed.error.message}`,
    )
  }

  return {
    status: 'ok',
    snapshot: {
      models: parsed.data.models,
      etag: getOpenAIResponseEtag(response),
      fetchedAt: new Date().toISOString(),
      clientVersion: runtimeVersion,
    },
  }
}

export async function refreshOpenAIModelCatalog(
  options: {
    env?: NodeJS.ProcessEnv
    fetchImpl?: OpenAIFetchLike
    provider?: ProviderConfig
    signal?: AbortSignal
    auth?: OpenAIAuthState | null
    refreshAuth?: boolean
  } = {},
): Promise<OpenAIModelCatalogSnapshot> {
  const env = options.env ?? process.env
  const existing = getCachedOpenAIModelCatalogSnapshot()

  if (!isOpenAIRuntime(env)) {
    return existing ?? getFallbackOpenAIModelCatalogSnapshot(env)
  }

  try {
    if (options.refreshAuth !== false) {
      await refreshOpenAIAuthStateIfNeeded(env, {
        fetchImpl: options.fetchImpl,
      }).catch(() => null)
    }

    const auth =
      options.auth === undefined ? readOpenAIAuthState(env) : options.auth
    if (!auth?.tokens.accessToken) {
      return existing ?? getFallbackOpenAIModelCatalogSnapshot(env)
    }

    const result = await fetchOpenAIModelCatalog({
      auth,
      env,
      provider: options.provider,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      ifNoneMatch: existing?.etag ?? null,
    })

    if (result.status === 'not_modified') {
      return existing ?? getFallbackOpenAIModelCatalogSnapshot(env)
    }

    if (
      existing &&
      isEqual(existing.models, result.snapshot.models) &&
      existing.etag === result.snapshot.etag &&
      existing.clientVersion === result.snapshot.clientVersion
    ) {
      saveGlobalConfig(current => ({
        ...current,
        openaiModelCatalogCache: {
          ...existing,
          fetchedAt: result.snapshot.fetchedAt,
          etag: result.snapshot.etag,
          clientVersion: result.snapshot.clientVersion,
        },
      }))
      return {
        ...existing,
        fetchedAt: result.snapshot.fetchedAt,
        etag: result.snapshot.etag,
        clientVersion: result.snapshot.clientVersion,
      }
    }

    logForDebugging(
      `[OpenAI Models] Cache updated with ${result.snapshot.models.length} models`,
    )
    saveGlobalConfig(current => ({
      ...current,
      openaiModelCatalogCache: result.snapshot,
    }))
    return result.snapshot
  } catch (error) {
    logForDebugging(
      `[OpenAI Models] Refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return existing ?? getFallbackOpenAIModelCatalogSnapshot(env)
  }
}
