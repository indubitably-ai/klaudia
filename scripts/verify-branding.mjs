import { readFile } from 'fs/promises'
import path from 'path'

const rootDir = process.cwd()

const defaultBannedSnippets = [
  'Anthropic Console',
  'your Anthropic account',
  'Switch Anthropic accounts',
  'Claude Desktop',
  'Claude in Chrome',
  'Help improve Claude',
  'Claude subscription',
  'Claude.ai account',
  'claude.ai/settings',
  'claude.ai/admin-settings',
  'claude.ai/chrome',
  'claude.ai/code',
  "Copy Claude's last response",
  'tell Claude what to do next',
  'tell Claude what to do differently',
  'Claude wants',
  "Here is Claude's plan",
  'Claude can delegate to',
  'Connect Claude',
  'Claude app',
  'Claude GitHub App',
  'Claude workflow',
  'What should Claude do instead?',
  'Searching with Claude',
  'Search deeply using Claude',
  'Claude found these results',
  'Claude needs your permission',
  'Claude needs your approval',
  'Claude can make mistakes',
  'How is Claude doing this session?',
  'Claude completes coding tasks',
  'Claude may use instructions',
  'Anthropic services',
]

const fileChecks = [
  'README.md',
  'ARCHITECTURE.md',
  'docs/testing/harness.md',
  'docs/testing/openai-live.md',
  'docs/testing/test-matrix.md',
  'docs/exec-plans/active/runtime-certification.md',
  'docs/quality/quality-score.md',
  'src/constants/system.ts',
  'src/constants/prompts.ts',
  'src/projectOnboardingState.ts',
  'src/main.tsx',
  'src/entrypoints/cli.tsx',
  'src/commands/bridge/index.ts',
  'src/commands/login/index.ts',
  'src/commands/logout/index.ts',
  'src/commands/privacy-settings/index.ts',
  'src/commands/upgrade/upgrade.tsx',
  'src/commands/copy/index.ts',
  'src/commands/init.ts',
  'src/commands/extra-usage/extra-usage-core.ts',
  'src/commands/review/ultrareviewCommand.tsx',
  'src/components/ConsoleOAuthFlow.tsx',
  'src/components/RemoteCallout.tsx',
  'src/components/Settings/Config.tsx',
  'src/components/LogoV2/ChannelsNotice.tsx',
  'src/components/FeedbackSurvey/TranscriptSharePrompt.tsx',
  'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
  'src/components/CostThresholdDialog.tsx',
  'src/components/grove/Grove.tsx',
  'src/components/HelpV2/General.tsx',
  'src/components/TeleportError.tsx',
  'src/components/Onboarding.tsx',
  'src/components/AutoModeOptInDialog.tsx',
  'src/components/ThinkingToggle.tsx',
  'src/components/InterruptedByUser.tsx',
  'src/components/OutputStylePicker.tsx',
  'src/components/ResumeTask.tsx',
  'src/components/PromptInput/PromptInput.tsx',
  'src/components/LogSelector.tsx',
  'src/components/IdeOnboardingDialog.tsx',
  'src/components/messages/UserToolResultMessage/RejectedPlanMessage.tsx',
  'src/components/hooks/SelectHookMode.tsx',
  'src/components/hooks/SelectMatcherMode.tsx',
  'src/components/hooks/SelectEventMode.tsx',
  'src/components/hooks/ViewHookMode.tsx',
  'src/components/hooks/HooksConfigMenu.tsx',
  'src/components/sandbox/SandboxOverridesTab.tsx',
  'src/components/agents/AgentsList.tsx',
  'src/components/agents/new-agent-creation/wizard-steps/DescriptionStep.tsx',
  'src/components/permissions/PermissionPrompt.tsx',
  'src/components/permissions/EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.tsx',
  'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
  'src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx',
  'src/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx',
  'src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx',
  'src/components/permissions/SandboxPermissionRequest.tsx',
  'src/components/permissions/FilePermissionDialog/permissionOptions.tsx',
  'src/components/permissions/WebFetchPermissionRequest/WebFetchPermissionRequest.tsx',
  'src/hooks/useChromeExtensionNotification.tsx',
  'src/hooks/useOfficialMarketplaceNotification.tsx',
  'src/hooks/notifs/useNpmDeprecationNotification.tsx',
  'src/hooks/notifs/useMcpConnectivityStatus.tsx',
  'src/hooks/notifs/useCanSwitchToExistingSubscription.tsx',
  'src/hooks/useVoice.ts',
  'src/cli/handlers/mcp.tsx',
  'src/components/MCPServerDesktopImportDialog.tsx',
  'src/components/mcp/MCPListPanel.tsx',
  'src/components/mcp/MCPSettings.tsx',
  'src/commands/remote-setup/remote-setup.tsx',
  'src/services/tips/tipRegistry.ts',
]

const allowlistByFile = new Map([
  [
    'README.md',
    ['Anthropic API', 'Anthropic SDK'],
  ],
  [
    'ARCHITECTURE.md',
    ['Anthropic analytics', 'Anthropic-internal', 'Anthropic auth module'],
  ],
  [
    'docs/testing/harness.md',
    ['Anthropic analytics'],
  ],
  [
    'docs/testing/test-matrix.md',
    ['Anthropic analytics'],
  ],
  [
    'docs/exec-plans/active/runtime-certification.md',
    ['Anthropic analytics', 'Anthropic account or telemetry behavior'],
  ],
  [
    'docs/quality/quality-score.md',
    ['Anthropic analytics'],
  ],
  [
    'src/constants/prompts.ts',
    ['Anthropic API'],
  ],
  [
    'src/main.tsx',
    [
      'Skipping Anthropic startup prefetches in OpenAI runtime',
    ],
  ],
  [
    'src/hooks/useVoice.ts',
    ["Anthropic's voice_stream", 'Anthropic voice_stream'],
  ],
])

async function read(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8')
}

function isAllowed(relativePath, snippet, content) {
  const allowlist = allowlistByFile.get(relativePath) ?? []
  return allowlist.some(allowed => snippet === allowed && content.includes(allowed))
}

async function main() {
  const failures = []

  for (const relativePath of fileChecks) {
    const content = await read(relativePath)
    for (const snippet of defaultBannedSnippets) {
      if (content.includes(snippet) && !isAllowed(relativePath, snippet, content)) {
        failures.push(`${relativePath}: found banned branding snippet: ${snippet}`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'))
  }
}

await main()
