/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */

import React from 'react'
import { ConsoleOpenAIAuthFlow } from '../../components/ConsoleOpenAIAuthFlow.js'
import { WelcomeV2 } from '../../components/LogoV2/WelcomeV2.js'
import type { Root } from '../../ink.js'
import { Box } from '../../ink.js'
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js'
import { AppStateProvider } from '../../state/AppState.js'
import { onChangeAppState } from '../../state/onChangeAppState.js'

export async function authLoginHandler(root: Root): Promise<void> {
  const result = await new Promise<'success' | 'cancelled'>(resolve => {
    root.render(
      <AppStateProvider onChangeAppState={onChangeAppState}>
        <KeybindingSetup>
          <Box flexDirection="column" gap={1}>
            <WelcomeV2 />
            <ConsoleOpenAIAuthFlow onDone={resolve} />
          </Box>
        </KeybindingSetup>
      </AppStateProvider>,
    )
  })

  root.unmount()
  process.exit(result === 'success' ? 0 : 1)
}
