import type { z } from 'zod/v4'
import {
  SDKControlCancelRequestSchema,
  SDKControlElicitationResponseSchema,
  SDKControlInitializeRequestSchema,
  SDKControlInitializeResponseSchema,
  SDKControlMcpSetServersResponseSchema,
  SDKControlPermissionRequestSchema,
  SDKControlReloadPluginsResponseSchema,
  SDKControlRequestInnerSchema,
  SDKControlRequestSchema,
  SDKControlResponseSchema,
  StdoutMessageSchema,
} from './controlSchemas.js'

export type StdoutMessage = z.infer<ReturnType<typeof StdoutMessageSchema>>
export type SDKControlRequestInner = z.infer<
  ReturnType<typeof SDKControlRequestInnerSchema>
>
export type SDKControlRequest = z.infer<ReturnType<typeof SDKControlRequestSchema>>
export type SDKControlResponse = z.infer<
  ReturnType<typeof SDKControlResponseSchema>
>
export type SDKControlPermissionRequest = z.infer<
  ReturnType<typeof SDKControlPermissionRequestSchema>
>
export type SDKControlCancelRequest = z.infer<
  ReturnType<typeof SDKControlCancelRequestSchema>
>
export type SDKControlInitializeRequest = z.infer<
  ReturnType<typeof SDKControlInitializeRequestSchema>
>
export type SDKControlInitializeResponse = z.infer<
  ReturnType<typeof SDKControlInitializeResponseSchema>
>
export type SDKControlMcpSetServersResponse = z.infer<
  ReturnType<typeof SDKControlMcpSetServersResponseSchema>
>
export type SDKControlReloadPluginsResponse = z.infer<
  ReturnType<typeof SDKControlReloadPluginsResponseSchema>
>
export type SDKControlElicitationResponse = z.infer<
  ReturnType<typeof SDKControlElicitationResponseSchema>
>
