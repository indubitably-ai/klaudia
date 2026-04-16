import type { Message } from './message.js'

type BaseToolProgress = {
  type: string
  [key: string]: unknown
}

export type ShellProgressBase = BaseToolProgress & {
  output?: string
  fullOutput?: string
  elapsedTimeSeconds?: number
  totalLines?: number
  totalBytes?: number
  timeoutMs?: number
  taskId?: string
}

export type BashProgress = ShellProgressBase & {
  type: 'bash_progress'
}

export type PowerShellProgress = ShellProgressBase & {
  type: 'powershell_progress'
}

export type ShellProgress = BashProgress | PowerShellProgress

export type AgentToolProgress = BaseToolProgress & {
  type: 'agent_progress'
  message: Message
  prompt: string
  agentId?: string
}

export type SkillToolProgress = BaseToolProgress & {
  type: 'skill_progress'
  message: Message
  prompt: string
  agentId?: string
}

export type MCPProgress = BaseToolProgress & {
  type: 'mcp_progress'
  status?: 'started' | 'completed' | 'failed' | string
  serverName?: string
  toolName?: string
  progress?: number
  total?: number
  progressMessage?: string
  elapsedTimeMs?: number
}

export type REPLToolProgress =
  | (BaseToolProgress & {
      type: 'repl_tool_call'
      phase?: 'start' | 'end' | string
      toolName?: string
      toolInput?: unknown
    })
  | (BaseToolProgress & {
      type: 'repl_progress'
    })

export type TaskOutputProgress = BaseToolProgress & {
  type: 'task_output_progress'
  taskId?: string
  status?: string
}

export type WebSearchProgress =
  | {
      type: 'query_update'
      query: string
    }
  | {
      type: 'search_results_received'
      query: string
      resultCount: number
    }

export type SdkWorkflowProgress = {
  type: string
  index?: number
  phaseIndex?: number
  label?: string
  status?: string
  [key: string]: unknown
}

export type ToolProgressData =
  | AgentToolProgress
  | BashProgress
  | MCPProgress
  | PowerShellProgress
  | REPLToolProgress
  | SkillToolProgress
  | TaskOutputProgress
  | WebSearchProgress
