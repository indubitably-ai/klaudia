import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

const command: Command = {
  name: 'chrome',
  description: 'Browser automation integration status',
  availability: ['claude-ai'],
  isEnabled: () => !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('../unavailableRemoteSurface.js'),
}

export default command
