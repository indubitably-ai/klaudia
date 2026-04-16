export type HookEvent = string
export type HookInput = Record<string, unknown>
export type HookJSONOutput = Record<string, unknown>
export type ModelUsage = Record<string, number>
export type PermissionUpdate = Record<string, unknown>
export type SDKMessage = {
  type?: string
  [key: string]: unknown
}
export type SDKPostTurnSummaryMessage = SDKMessage
export type SDKResultMessage = SDKMessage
export type SDKResultSuccess = SDKMessage
export type SDKSessionInfo = {
  id?: string
  title?: string
  sessionId?: string
  [key: string]: unknown
}
export type SDKStreamlinedTextMessage = SDKMessage
export type SDKStreamlinedToolUseSummaryMessage = SDKMessage
export type SDKUserMessage = SDKMessage
