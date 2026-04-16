import type { ZodRawShape } from 'zod/v4'
import type { SDKMessage, SDKSessionInfo, SDKUserMessage } from './coreTypes.js'

export type AnyZodRawShape = ZodRawShape

export type InferShape<Schema extends ZodRawShape> = {
  [Key in keyof Schema]?: unknown
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export type SdkMcpToolDefinition<Schema extends ZodRawShape = ZodRawShape> = {
  name?: string
  description?: string
  inputSchema?: Schema
}

export type McpSdkServerConfigWithInstance = {
  type: 'sdk'
  name?: string
  version?: string
  instance?: unknown
}

export type Options = Record<string, unknown>
export type InternalOptions = Options

export type Query = AsyncIterable<SDKMessage>
export type InternalQuery = AsyncIterable<SDKMessage>

export type SDKSessionOptions = Record<string, unknown>
export type SessionMutationOptions = {
  dir?: string
}
export type ListSessionsOptions = SessionMutationOptions & {
  limit?: number
  offset?: number
}
export type GetSessionInfoOptions = SessionMutationOptions
export type GetSessionMessagesOptions = SessionMutationOptions & {
  limit?: number
  offset?: number
  includeSystemMessages?: boolean
}
export type ForkSessionOptions = SessionMutationOptions & {
  upToMessageId?: string
  title?: string
}
export type ForkSessionResult = {
  sessionId: string
}
export type SessionMessage = SDKMessage
export type SDKSession = {
  id?: string
}
export type InternalQueryParams = {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}
export type McpSdkServerConfig = McpSdkServerConfigWithInstance
