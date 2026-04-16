import { describe, expect, it } from 'bun:test'
import * as React from 'react'
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseQueuedMessage,
} from 'src/tools/BashTool/UI.js'

function collectText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(child => collectText(child)).join('')
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>
    return collectText(element.props.children)
  }

  return ''
}

describe('BashTool UI labels', () => {
  it('renders sed in-place edits as file paths', () => {
    expect(
      collectText(
        renderToolUseMessage(
          { command: "sed -i '' 's/foo/bar/' /tmp/example.txt" },
          { verbose: false, theme: 'dark' as never },
        ),
      ),
    ).toBe('/tmp/example.txt')

    expect(
      collectText(
        renderToolUseMessage(
          { command: "sed -i '' 's/foo/bar/' /tmp/example.txt" },
          { verbose: true, theme: 'dark' as never },
        ),
      ),
    ).toBe('/tmp/example.txt')
  })

  it('truncates long multiline commands in compact mode', () => {
    const command = ['printf 1', 'printf 2', 'printf 3'].join('\n')

    expect(
      collectText(
        renderToolUseMessage(
          { command },
          { verbose: false, theme: 'dark' as never },
        ),
      ),
    ).toBe('printf 1\nprintf 2…')
  })

  it('renders queued and empty progress states', () => {
    expect(collectText(renderToolUseQueuedMessage())).toBe('Waiting…')
    expect(
      collectText(
        renderToolUseProgressMessage([], {
          verbose: false,
          tools: [],
        }),
      ),
    ).toBe('Running…')
  })
})

describe('BashTool result labels', () => {
  it('returns React output for stderr cleanup and background/no-output states', () => {
    expect(
      React.isValidElement(
        renderToolResultMessage(
          {
            stdout: '',
            stderr:
              'real error\n<sandbox_violations>blocked</sandbox_violations>\nShell cwd was reset to /tmp',
            isImage: false,
          } as never,
          [],
          { verbose: false, theme: 'dark' as never, tools: [] },
        ),
      ),
    ).toBe(true)

    expect(
      React.isValidElement(
        renderToolResultMessage(
          {
            stdout: '',
            stderr: '',
            isImage: false,
            backgroundTaskId: 'task-123',
          } as never,
          [],
          { verbose: false, theme: 'dark' as never, tools: [] },
        ),
      ),
    ).toBe(true)

    expect(
      React.isValidElement(
        renderToolResultMessage(
          {
            stdout: '',
            stderr: '',
            isImage: false,
            noOutputExpected: true,
          } as never,
          [],
          { verbose: false, theme: 'dark' as never, tools: [] },
        ),
      ),
    ).toBe(true)

    expect(
      React.isValidElement(
        renderToolResultMessage(
          {
            stdout: '',
            stderr: '',
            isImage: false,
          } as never,
          [{ data: { timeoutMs: 1500 } } as never],
          { verbose: false, theme: 'dark' as never, tools: [] },
        ),
      ),
    ).toBe(true)
  })
})
