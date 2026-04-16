import type {
  OpenAIAuthFailureReason,
  OpenAIAuthSource,
} from './index.js'

export function getOpenAIAuthLoginRequiredTitle(): string {
  return 'ChatGPT/Codex login required'
}

export function getOpenAIAuthLoginRequiredMessage(): string {
  return 'Run `klaudia auth login` to sign in to ChatGPT/Codex in your browser.'
}

export function getOpenAIAuthMissingAssistantMessage(): string {
  return 'Not logged in · Run `klaudia auth login` to sign in to ChatGPT/Codex.'
}

export function getOpenAIAuthStatusMissingMessage(): string {
  return `Not logged in. ${getOpenAIAuthLoginRequiredMessage()}`
}

export function getOpenAIAuthRecoveryCopy(
  authSource: OpenAIAuthSource,
  reason: OpenAIAuthFailureReason,
): {
  title: string
  message: string
  assistantMessage: string
} {
  if (authSource === 'codex-import') {
    switch (reason) {
      case 'refresh_token_reused':
        return {
          title: 'Imported Codex auth is stale',
          message:
            'Your imported Codex auth is stale because its refresh token was already reused by Codex. Run `klaudia auth login` for a fresh browser sign-in, or refresh Codex and rerun `klaudia auth import-codex`.',
          assistantMessage:
            'Imported Codex auth is stale · Run `klaudia auth login` for a fresh browser sign-in, or refresh Codex and rerun `klaudia auth import-codex`.',
        }
      case 'refresh_token_expired':
        return {
          title: 'Imported Codex auth expired',
          message:
            'Your imported Codex auth expired before Klaudia could refresh it. Run `klaudia auth login` for a fresh browser sign-in, or sign in with Codex again and rerun `klaudia auth import-codex`.',
          assistantMessage:
            'Imported Codex auth expired · Run `klaudia auth login` for a fresh browser sign-in, or sign in with Codex again and rerun `klaudia auth import-codex`.',
        }
      case 'refresh_token_revoked':
        return {
          title: 'Imported Codex auth was revoked',
          message:
            'Your imported Codex auth was revoked. Run `klaudia auth login` for a fresh browser sign-in, or sign in with Codex again and rerun `klaudia auth import-codex`.',
          assistantMessage:
            'Imported Codex auth was revoked · Run `klaudia auth login` for a fresh browser sign-in, or sign in with Codex again and rerun `klaudia auth import-codex`.',
        }
      default:
        return {
          title: 'Imported Codex auth needs attention',
          message:
            'Klaudia could not refresh your imported Codex auth. Run `klaudia auth login` for a fresh browser sign-in, or refresh Codex and rerun `klaudia auth import-codex`.',
          assistantMessage:
            'Imported Codex auth needs attention · Run `klaudia auth login` for a fresh browser sign-in, or refresh Codex and rerun `klaudia auth import-codex`.',
        }
    }
  }

  return {
    title: 'ChatGPT/Codex login expired',
    message:
      'Your ChatGPT/Codex login needs to be refreshed. Run `klaudia auth login` again.',
    assistantMessage:
      'ChatGPT/Codex login expired · Run `klaudia auth login` again.',
  }
}
