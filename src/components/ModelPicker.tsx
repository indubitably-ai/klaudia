import capitalize from 'lodash-es/capitalize.js'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js'
import { Box, Text } from '../ink.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js'
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { Select } from './CustomSelect/select.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Byline } from './design-system/Byline.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Pane } from './design-system/Pane.js'
import { effortLevelToSymbol } from './EffortIndicator.js'

export type Props = {
  initial: string | null
  sessionModel?: ModelSetting
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void
  onCancel?: () => void
  isStandaloneCommand?: boolean
  showFastModeNotice?: boolean
  headerText?: string
  skipSettingsWrite?: boolean
}

const NO_PREFERENCE = '__NO_PREFERENCE__'

function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined
  return value === NO_PREFERENCE ? getDefaultMainLoopModel() : parseUserSpecifiedModel(value)
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  includeMax: boolean,
): EffortLevel {
  const levels: EffortLevel[] = includeMax
    ? ['low', 'medium', 'high', 'max']
    : ['low', 'medium', 'high']
  const idx = levels.indexOf(current)
  const currentIndex = idx !== -1 ? idx : levels.indexOf('high')

  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!
  }

  return levels[(currentIndex - 1 + levels.length) % levels.length]!
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel()
  const defaultValue = getDefaultEffortForModel(resolved)
  return defaultValue !== undefined
    ? convertEffortValueToLevel(defaultValue)
    : 'high'
}

function EffortLevelIndicator({
  effort,
}: {
  effort: EffortLevel | undefined
}): React.ReactNode {
  return (
    <Text color={effort ? 'claude' : 'subtle'}>
      {effortLevelToSymbol(effort ?? 'low')}
    </Text>
  )
}

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const exitState = useExitOnCtrlCDWithKeybindings()
  const initialValue = initial === null ? NO_PREFERENCE : initial
  const isFastMode = useAppState(s => (isFastModeEnabled() ? s.fastMode : false))
  const effortValue = useAppState(s => s.effortValue)
  const [hasToggledEffort, setHasToggledEffort] = useState(false)
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined,
  )

  const modelOptions = useMemo(
    () => getModelOptions(isFastMode ?? false),
    [isFastMode],
  )
  const optionsWithInitial = useMemo(() => {
    if (initial && !modelOptions.some(option => option.value === initial)) {
      return [
        {
          value: initial,
          label: modelDisplayString(initial),
          description: 'Current model (custom ID)',
        },
        ...modelOptions,
      ]
    }

    return modelOptions
  }, [initial, modelOptions])
  const selectOptions = useMemo(
    () =>
      optionsWithInitial.map(option => ({
        ...option,
        value: option.value === null ? NO_PREFERENCE : option.value,
      })),
    [optionsWithInitial],
  )
  const initialFocusValue = useMemo(() => {
    if (selectOptions.some(option => option.value === initialValue)) {
      return initialValue
    }

    return selectOptions[0]?.value
  }, [initialValue, selectOptions])
  const defaultSelectValue = useMemo(() => {
    if (selectOptions.some(option => option.value === initialValue)) {
      return initialValue
    }

    return initialFocusValue
  }, [initialFocusValue, initialValue, selectOptions])
  const [focusedValue, setFocusedValue] = useState(defaultSelectValue)

  useEffect(() => {
    setFocusedValue(defaultSelectValue)
  }, [defaultSelectValue])

  const visibleCount = Math.min(10, selectOptions.length)
  const hiddenCount = Math.max(0, selectOptions.length - visibleCount)
  const focusedModelName = selectOptions.find(
    option => option.value === focusedValue,
  )?.label
  const focusedModel = resolveOptionModel(focusedValue)
  const focusedSupportsEffort = focusedModel
    ? modelSupportsEffort(focusedModel)
    : false
  const focusedSupportsMax = focusedModel
    ? modelSupportsMaxEffort(focusedModel)
    : false
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedValue)
  const displayEffort =
    effort === 'max' && !focusedSupportsMax ? 'high' : effort

  const handleFocus = (value: string) => {
    setFocusedValue(value)
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value))
    }
  }

  const handleCycleEffort = (direction: 'left' | 'right') => {
    if (!focusedSupportsEffort) {
      return
    }

    setEffort(previous =>
      cycleEffortLevel(
        previous ?? focusedDefaultEffort,
        direction,
        focusedSupportsMax,
      ),
    )
    setHasToggledEffort(true)
  }

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    },
    { context: 'ModelPicker' },
  )

  const handleSelect = (value: string) => {
    logEvent('tengu_model_command_menu_effort', {
      effort: effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    if (!skipSettingsWrite) {
      const effortLevel = resolvePickerEffortPersistence(
        effort,
        getDefaultEffortLevelForOption(value),
        getSettingsForSource('userSettings')?.effortLevel,
        hasToggledEffort,
      )
      const persistable = toPersistableEffort(effortLevel)
      if (persistable !== undefined) {
        updateSettingsForSource('userSettings', {
          effortLevel: persistable,
        })
      }

      setAppState(previous => ({
        ...previous,
        effortValue: effortLevel,
      }))
    }

    const selectedModel = resolveOptionModel(value)
    const selectedEffort =
      hasToggledEffort &&
      selectedModel &&
      modelSupportsEffort(selectedModel)
        ? effort
        : undefined

    if (value === NO_PREFERENCE) {
      onSelect(null, selectedEffort)
      return
    }

    onSelect(value, selectedEffort)
  }

  const effectiveHeaderText =
    headerText ??
    'Switch between available models. Applies to this session and future Klaudia sessions. For other model IDs, specify with --model.'

  const content = (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="remember" bold>
          Select model
        </Text>
        <Text dimColor>{effectiveHeaderText}</Text>
        {sessionModel ? (
          <Text dimColor>
            Currently using {modelDisplayString(sessionModel)} for this session
            {' '} (set by plan mode). Selecting a model will undo this.
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="column">
          <Select
            defaultValue={defaultSelectValue}
            defaultFocusValue={initialFocusValue}
            options={selectOptions}
            onChange={handleSelect}
            onFocus={handleFocus}
            onCancel={onCancel ?? (() => {})}
            visibleOptionCount={visibleCount}
          />
        </Box>
        {hiddenCount > 0 ? (
          <Box paddingLeft={3}>
            <Text dimColor>and {hiddenCount} more…</Text>
          </Box>
        ) : null}
      </Box>

      <Box marginBottom={1} flexDirection="column">
        {focusedSupportsEffort ? (
          <Text dimColor>
            <EffortLevelIndicator effort={displayEffort} />{' '}
            {capitalize(displayEffort)} effort
            {displayEffort === focusedDefaultEffort ? ' (default)' : ''}
            {' '}
            <Text color="subtle">← → to adjust</Text>
          </Text>
        ) : (
          <Text color="subtle">
            <EffortLevelIndicator effort={undefined} /> Effort not supported
            {focusedModelName ? ` for ${focusedModelName}` : ''}
          </Text>
        )}
      </Box>

      {isFastModeEnabled() ? (
        showFastModeNotice ? (
          <Box marginBottom={1}>
            <Text dimColor>
              Fast mode is <Text bold>ON</Text> and available with{' '}
              {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other models
              {' '}turn off fast mode.
            </Text>
          </Box>
        ) : isFastModeAvailable() && !isFastModeCooldown() ? (
          <Box marginBottom={1}>
            <Text dimColor>
              Use <Text bold>/fast</Text> to turn on Fast mode (
              {FAST_MODE_MODEL_DISPLAY} only).
            </Text>
          </Box>
        ) : null
      ) : null}

      {isStandaloneCommand ? (
        <Text dimColor italic>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          )}
        </Text>
      ) : null}
    </Box>
  )

  if (!isStandaloneCommand) {
    return content
  }

  return <Pane color="permission">{content}</Pane>
}
