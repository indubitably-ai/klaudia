import { describe, expect, it } from 'bun:test'
import { call } from 'src/commands/help/help.tsx'
import { HelpV2 } from 'src/components/HelpV2/HelpV2.js'

describe('command/help', () => {
  it('returns a HelpV2 element with commands prop', async () => {
    const onDone = () => {}
    const commands = [{ name: 'version', description: 'Version' }]
    const node = await call(onDone, { options: { commands } } as never)

    expect(node).toBeTruthy()
    if (typeof node === 'object' && node && 'type' in node) {
      expect(node.type).toBe(HelpV2)
      expect((node as any).props.commands).toBe(commands)
      expect((node as any).props.onClose).toBe(onDone)
    }
  })
})
