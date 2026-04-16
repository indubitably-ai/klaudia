import type { Command, LocalCommandCall } from '../types/command.js'
import {
  getRuntimeBuildTime,
  getRuntimeVersion,
} from '../utils/runtimeVersion.js'

const call: LocalCommandCall = async () => {
  const buildTime = getRuntimeBuildTime()
  const version = getRuntimeVersion()
  return {
    type: 'text',
    value: buildTime ? `${version} (built ${buildTime})` : version,
  }
}

const version = {
  type: 'local',
  name: 'version',
  description:
    'Print the version this session is running (not what autoupdate downloaded)',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default version
