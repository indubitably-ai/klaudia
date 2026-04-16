import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ContentBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'

type MessageUUID = UUID | string

type MessageBase = {
  uuid: MessageUUID
  timestamp: string
  isMeta?: boolean
  [key: string]: unknown
}

type AssistantAPIMessage<TContent = BetaContentBlock> = {
  id: string
  role: 'assistant'
  content: TContent[]
  model?: string
  usage?: any
  type?: string
  stop_reason?: string | null
  stop_sequence?: string | null
  container?: unknown
  context_management?: unknown
  [key: string]: unknown
}

type UserAPIMessage<TContent = string | ContentBlockParam[]> = {
  role: 'user'
  content: TContent
  [key: string]: unknown
}

type AttachmentPayload = {
  type: string
  [key: string]: any
}

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }

export type PartialCompactDirection = 'from' | 'up_to'

export type SystemMessageLevel = 'info' | 'warning' | 'error'

export type StopHookInfo = {
  command?: string
  promptText?: string
  [key: string]: unknown
}

export type CompactMetadata = {
  trigger: 'manual' | 'auto' | string
  preTokens: number
  userContext?: string
  messagesSummarized?: number
  preservedSegment?: {
    headUuid: string
    anchorUuid: string
    tailUuid: string
  }
  preCompactDiscoveredTools?: string[]
  [key: string]: unknown
}

export type MicrocompactMetadata = {
  trigger: 'auto' | string
  preTokens: number
  tokensSaved: number
  compactedToolIds: string[]
  clearedAttachmentUUIDs: string[]
  [key: string]: unknown
}

export type AssistantMessage<TContent = BetaContentBlock> = MessageBase & {
  type: 'assistant'
  message: AssistantAPIMessage<TContent>
  requestId?: string
  apiError?: string
  error?: unknown
  errorDetails?: string
  isApiErrorMessage?: boolean
  isVirtual?: true
  advisorModel?: string
}

export type UserMessage<TContent = string | ContentBlockParam[]> =
  MessageBase & {
    type: 'user'
    message: UserAPIMessage<TContent>
    isVisibleInTranscriptOnly?: true
    isVirtual?: true
    isCompactSummary?: true
    summarizeMetadata?: {
      messagesSummarized: number
      userContext?: string
      direction?: PartialCompactDirection
    }
    toolUseResult?: unknown
    mcpMeta?: {
      _meta?: Record<string, unknown>
      structuredContent?: Record<string, unknown>
    }
    imagePasteIds?: number[]
    sourceToolAssistantUUID?: UUID
    permissionMode?: string
    origin?: MessageOrigin
  }

export type AttachmentMessage<TAttachment extends AttachmentPayload = AttachmentPayload> =
  MessageBase & {
    type: 'attachment'
    attachment: TAttachment
  }

export type HookResultMessage = AttachmentMessage

export type ProgressMessage<P = unknown> = MessageBase & {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID: string
}

type SystemBaseMessage = MessageBase & {
  type: 'system'
  subtype: string
  content?: string
  level?: SystemMessageLevel
}

export type SystemInformationalMessage = SystemBaseMessage & {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemPermissionRetryMessage = SystemBaseMessage & {
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
}

export type SystemBridgeStatusMessage = SystemBaseMessage & {
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
}

export type SystemScheduledTaskFireMessage = SystemBaseMessage & {
  subtype: 'scheduled_task_fire'
  content: string
}

export type SystemStopHookSummaryMessage = SystemBaseMessage & {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput: boolean
  hookLabel?: string
  totalDurationMs?: number
  toolUseID?: string
  level?: SystemMessageLevel
}

export type SystemTurnDurationMessage = SystemBaseMessage & {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}

export type SystemAwaySummaryMessage = SystemBaseMessage & {
  subtype: 'away_summary'
  content: string
}

export type SystemMemorySavedMessage = SystemBaseMessage & {
  subtype: 'memory_saved'
  writtenPaths: string[]
}

export type SystemAgentsKilledMessage = SystemBaseMessage & {
  subtype: 'agents_killed'
}

export type SystemApiMetricsMessage = SystemBaseMessage & {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}

export type SystemLocalCommandMessage = SystemBaseMessage & {
  subtype: 'local_command'
  content: string
  level?: SystemMessageLevel
}

export type SystemCompactBoundaryMessage = SystemBaseMessage & {
  subtype: 'compact_boundary'
  content: string
  level?: SystemMessageLevel
  compactMetadata: CompactMetadata
  logicalParentUuid?: MessageUUID
}

export type SystemMicrocompactBoundaryMessage = SystemBaseMessage & {
  subtype: 'microcompact_boundary'
  content: string
  level?: SystemMessageLevel
  microcompactMetadata: MicrocompactMetadata
}

export type SystemAPIErrorMessage = SystemBaseMessage & {
  subtype: 'api_error'
  error: unknown
  cause?: Error
  retryInMs: number
  retryAttempt: number
  maxRetries: number
  level?: SystemMessageLevel
}

export type SystemThinkingMessage = SystemBaseMessage & {
  subtype: 'thinking'
  thinking: string
}

export type SystemMessage =
  | SystemInformationalMessage
  | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage
  | SystemThinkingMessage

export type NormalizedAssistantMessage<TContent = BetaContentBlock> =
  AssistantMessage<TContent> & {
    message: AssistantAPIMessage<TContent>
  }

export type NormalizedUserMessage<TContent = ContentBlockParam> =
  UserMessage<TContent[]> & {
    message: UserAPIMessage<TContent[]>
  }

export type Message =
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage
  | UserMessage

export type NormalizedMessage =
  | AttachmentMessage
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | ProgressMessage
  | SystemMessage

export type GroupedToolUseMessage = {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantMessage
  uuid: string
  timestamp: string
  messageId: string
  [key: string]: unknown
}

export type CollapsibleMessage =
  | GroupedToolUseMessage
  | NormalizedAssistantMessage
  | NormalizedUserMessage

export type CollapsedReadSearchGroup = {
  type: 'collapsed_read_search'
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint?: string
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  uuid: MessageUUID
  timestamp: string
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: Array<{ sha: string; kind?: string }>
  pushes?: Array<{ branch: string }>
  branches?: Array<{ ref: string; action?: string }>
  prs?: Array<{ number: number; url?: string; action?: string }>
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: Array<{
    path: string
    content: string
    mtimeMs: number
  }>
  [key: string]: unknown
}

export type RenderableMessage =
  | AttachmentMessage
  | CollapsedReadSearchGroup
  | GroupedToolUseMessage
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | SystemMessage

export type RequestStartEvent = {
  type: 'request_start'
  [key: string]: unknown
}

export type StreamEvent = {
  type: 'stream_event'
  event: unknown
  [key: string]: unknown
}

export type TombstoneMessage = {
  type: 'tombstone'
  uuid: MessageUUID
  timestamp: string
  [key: string]: unknown
}

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: MessageUUID
  timestamp: string
  [key: string]: unknown
}
