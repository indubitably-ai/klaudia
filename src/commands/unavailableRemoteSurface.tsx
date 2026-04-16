import type { LocalJSXCommandCall } from '../types/command.js'

export const UNAVAILABLE_REMOTE_SURFACE_MESSAGE =
  'This hosted surface is disabled in this Klaudia build. The command will return once INDUBITABLY.AI infrastructure replaces the legacy dependency.'

export const call: LocalJSXCommandCall = async onDone => {
  onDone(UNAVAILABLE_REMOTE_SURFACE_MESSAGE, {
    display: 'system',
  })
  return null
}
