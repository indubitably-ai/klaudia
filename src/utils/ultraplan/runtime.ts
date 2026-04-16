import { feature } from 'bun:bundle'
import { isOpenAIRuntime } from '../../provider/providerRegistry.js'

export function isUltraplanRuntimeEnabled(): boolean {
  return "external" === 'ant' && feature('ULTRAPLAN') && !isOpenAIRuntime()
}
