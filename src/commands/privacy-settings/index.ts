import type { Command } from '../../commands.js'
import { isConsumerSubscriber } from '../../utils/auth.js'

const privacySettings = {
  type: 'local-jsx',
  name: 'privacy-settings',
  description: 'Hosted privacy settings status',
  isEnabled: () => {
    return isConsumerSubscriber()
  },
  load: () => import('../unavailableRemoteSurface.js'),
} satisfies Command

export default privacySettings
