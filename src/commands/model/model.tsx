import chalk from 'chalk'
import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { ModelPicker } from '../../components/ModelPicker.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import { Box, Text } from '../../ink.js'
import { refreshOpenAIModelCatalog } from '../../provider/openaiModelCatalog.js'
import { isOpenAIRuntime } from '../../provider/providerRegistry.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import type { EffortLevel } from '../../utils/effort.js'
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js'
import {
  clearFastModeCooldown,
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js'
import { MODEL_ALIASES } from '../../utils/model/aliases.js'
import {
  checkOpus1mAccess,
  checkSonnet1mAccess,
} from '../../utils/model/check1mAccess.js'
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel,
  renderDefaultModelSetting,
} from '../../utils/model/model.js'
import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import { validateModel } from '../../utils/model/validateModel.js'

function renderModelLabel(model: string | null): string {
  const rendered = renderDefaultModelSetting(
    model ?? getDefaultMainLoopModelSetting(),
  )
  return model === null ? `${rendered} (default)` : rendered
}

function isKnownAlias(model: string): boolean {
  const normalized = model.toLowerCase().trim()
  return (
    (MODEL_ALIASES as readonly string[]).includes(normalized) ||
    parseUserSpecifiedModel(normalized) !== model.trim()
  )
}

function isOpus1mUnavailable(model: string): boolean {
  const normalized = model.toLowerCase()
  return (
    !checkOpus1mAccess() &&
    !isOpus1mMergeEnabled() &&
    normalized.includes('opus') &&
    normalized.includes('[1m]')
  )
}

function isSonnet1mUnavailable(model: string): boolean {
  const normalized = model.toLowerCase()
  return (
    !checkSonnet1mAccess() &&
    (normalized.includes('sonnet[1m]') ||
      normalized.includes('sonnet-4-6[1m]'))
  )
}

function ModelPickerWrapper({
  onDone,
}: {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession)
  const isFastMode = useAppState(s => s.fastMode)
  const setAppState = useSetAppState()
  // Refresh the live catalog whenever /model opens so long-lived sessions can
  // recover from fallback snapshots and pick up newly launched models.
  const shouldLoadOpenAIModelCatalog = isOpenAIRuntime()
  const [isCatalogReady, setIsCatalogReady] = React.useState(
    !shouldLoadOpenAIModelCatalog,
  )

  React.useEffect(() => {
    if (!shouldLoadOpenAIModelCatalog) {
      return
    }

    let isMounted = true
    void refreshOpenAIModelCatalog().finally(() => {
      if (isMounted) {
        setIsCatalogReady(true)
      }
    })

    return () => {
      isMounted = false
    }
  }, [shouldLoadOpenAIModelCatalog])

  function handleCancel(): void {
    logEvent('tengu_model_command_menu', {
      action:
        'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    onDone(`Kept model as ${chalk.bold(renderModelLabel(mainLoopModel))}`, {
      display: 'system',
    })
  }

  function handleSelect(
    model: string | null,
    effort: EffortLevel | undefined,
  ): void {
    logEvent('tengu_model_command_menu', {
      action:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      from_model:
        mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    setAppState(previous => ({
      ...previous,
      mainLoopModel: model,
      mainLoopModelForSession: null,
    }))

    let message = `Set model to ${chalk.bold(renderModelLabel(model))}`
    if (effort !== undefined) {
      message += ` with ${chalk.bold(effort)} effort`
    }

    let wasFastModeToggledOn: boolean | undefined
    if (isFastModeEnabled()) {
      clearFastModeCooldown()
      if (!isFastModeSupportedByModel(model) && isFastMode) {
        setAppState(previous => ({
          ...previous,
          fastMode: false,
        }))
        wasFastModeToggledOn = false
      } else if (
        isFastModeSupportedByModel(model) &&
        isFastModeAvailable() &&
        isFastMode
      ) {
        message += ' · Fast mode ON'
        wasFastModeToggledOn = true
      }
    }

    if (
      isBilledAsExtraUsage(
        model,
        wasFastModeToggledOn === true,
        isOpus1mMergeEnabled(),
      )
    ) {
      message += ' · Billed as extra usage'
    }

    if (wasFastModeToggledOn === false) {
      message += ' · Fast mode OFF'
    }

    onDone(message)
  }

  if (!isCatalogReady) {
    return (
      <Box>
        <Text>Loading available models...</Text>
      </Box>
    )
  }

  return (
    <ModelPicker
      initial={mainLoopModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
      showFastModeNotice={
        isFastModeEnabled() &&
        isFastMode &&
        isFastModeSupportedByModel(mainLoopModel) &&
        isFastModeAvailable()
      }
    />
  )
}

function SetModelAndClose({
  args,
  onDone,
}: {
  args: string
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}): React.ReactNode {
  const isFastMode = useAppState(s => s.fastMode)
  const setAppState = useSetAppState()
  const model = args === 'default' ? null : args

  React.useEffect(() => {
    async function handleModelChange(): Promise<void> {
      if (model && !isModelAllowed(model)) {
        onDone(
          `Model '${model}' is not available. Your organization restricts model selection.`,
          {
            display: 'system',
          },
        )
        return
      }

      if (model && isOpus1mUnavailable(model)) {
        onDone(
          'Opus 4.6 with 1M context is not available for your account. Learn more: https://code.klaudia.com/docs/en/model-config#extended-context-with-1m',
          { display: 'system' },
        )
        return
      }

      if (model && isSonnet1mUnavailable(model)) {
        onDone(
          'Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.klaudia.com/docs/en/model-config#extended-context-with-1m',
          { display: 'system' },
        )
        return
      }

      if (!model) {
        setModel(null)
        return
      }

      if (isKnownAlias(model)) {
        setModel(model)
        return
      }

      try {
        const { valid, error } = await validateModel(model)
        if (valid) {
          setModel(model)
          return
        }

        onDone(error || `Model '${model}' not found`, {
          display: 'system',
        })
      } catch (error) {
        onDone(`Failed to validate model: ${(error as Error).message}`, {
          display: 'system',
        })
      }
    }

    function setModel(modelValue: string | null): void {
      setAppState(previous => ({
        ...previous,
        mainLoopModel: modelValue,
        mainLoopModelForSession: null,
      }))

      let message = `Set model to ${chalk.bold(renderModelLabel(modelValue))}`
      let wasFastModeToggledOn: boolean | undefined
      if (isFastModeEnabled()) {
        clearFastModeCooldown()
        if (!isFastModeSupportedByModel(modelValue) && isFastMode) {
          setAppState(previous => ({
            ...previous,
            fastMode: false,
          }))
          wasFastModeToggledOn = false
        } else if (isFastModeSupportedByModel(modelValue) && isFastMode) {
          message += ' · Fast mode ON'
          wasFastModeToggledOn = true
        }
      }

      if (
        isBilledAsExtraUsage(
          modelValue,
          wasFastModeToggledOn === true,
          isOpus1mMergeEnabled(),
        )
      ) {
        message += ' · Billed as extra usage'
      }

      if (wasFastModeToggledOn === false) {
        message += ' · Fast mode OFF'
      }

      onDone(message)
    }

    void handleModelChange()
  }, [isFastMode, model, onDone, setAppState])

  return null
}

function ShowModelAndClose({
  onDone,
}: {
  onDone: (result?: string) => void
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession)
  const effortValue = useAppState(s => s.effortValue)
  const displayModel = renderModelLabel(mainLoopModel)
  const effortInfo =
    effortValue !== undefined ? ` (effort: ${effortValue})` : ''

  if (mainLoopModelForSession) {
    onDone(
      `Current model: ${chalk.bold(renderModelLabel(mainLoopModelForSession))} (session override from plan mode)\nBase model: ${displayModel}${effortInfo}`,
    )
  } else {
    onDone(`Current model: ${displayModel}${effortInfo}`)
  }

  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const trimmedArgs = args?.trim() || ''

  if (COMMON_INFO_ARGS.includes(trimmedArgs)) {
    logEvent('tengu_model_command_inline_help', {
      args:
        trimmedArgs as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return <ShowModelAndClose onDone={onDone} />
  }

  if (COMMON_HELP_ARGS.includes(trimmedArgs)) {
    onDone(
      'Run /model to open the model selection menu, or /model [modelName] to set the model.',
      {
        display: 'system',
      },
    )
    return
  }

  if (trimmedArgs) {
    logEvent('tengu_model_command_inline', {
      args:
        trimmedArgs as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return <SetModelAndClose args={trimmedArgs} onDone={onDone} />
  }

  return <ModelPickerWrapper onDone={onDone} />
}
