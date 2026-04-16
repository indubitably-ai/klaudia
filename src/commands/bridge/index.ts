import { feature } from 'bun:bundle'
import { isBridgeEnabled } from '../../bridge/bridgeEnabled.js'
import type { Command } from '../../commands.js'

function isEnabled(): boolean {
  if (!feature('BRIDGE_MODE')) {
    return false
  }
  return isBridgeEnabled()
}

const bridge = {
  type: 'local-jsx',
  name: 'remote-control',
  aliases: ['rc'],
  description: 'Hosted Klaudia remote-control status',
  argumentHint: '[name]',
  isEnabled,
  get isHidden() {
    return !isEnabled()
  },
  immediate: true,
  load: () => import('../unavailableRemoteSurface.js'),
} satisfies Command

export default bridge
