import { describe, expect, it, mock } from 'bun:test'
import * as React from 'react'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName,
} from 'src/tools/FileReadTool/UI.js'
import { getPlansDirectory } from 'src/utils/plans.js'
import { getTaskOutputDir } from 'src/utils/task/diskOutput.js'

mock.module('src/utils/settings/mdm/settings.js', () => ({
  getMdmSettings: () => ({ settings: {}, errors: [] }),
  getHkcuSettings: () => ({ settings: {}, errors: [] }),
}))

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

describe('FileReadTool UI helpers', () => {
  it('reports user-facing names for plan, agent output, and regular reads', () => {
    const planPath = `${getPlansDirectory()}/example.md`
    const agentOutputPath = `${getTaskOutputDir()}/task-123.output`

    expect(userFacingName({ file_path: planPath })).toBe('Reading Plan')
    expect(userFacingName({ file_path: agentOutputPath })).toBe(
      'Read agent output',
    )
    expect(userFacingName({ file_path: '/tmp/example.txt' })).toBe('Read')
  })

  it('summarizes agent output by task id and regular reads by display path', () => {
    const agentOutputPath = `${getTaskOutputDir()}/task-123.output`

    expect(getToolUseSummary({ file_path: agentOutputPath })).toBe('task-123')
    expect(getToolUseSummary({ file_path: '/tmp/example.txt' })).toBe(
      '/tmp/example.txt',
    )
  })

  it('renders page and verbose line-range labels', () => {
    expect(
      collectText(
        renderToolUseMessage(
          { file_path: '/tmp/example.pdf', pages: '2-4' },
          { verbose: false },
        ),
      ),
    ).toBe('/tmp/example.pdf · pages 2-4')

    expect(
      collectText(
        renderToolUseMessage(
          { file_path: '/tmp/example.txt', offset: 5, limit: 3 },
          { verbose: true },
        ),
      ),
    ).toBe('/tmp/example.txt · lines 5-7')

    expect(
      collectText(
        renderToolUseMessage(
          { file_path: '/tmp/example.txt', offset: 5 },
          { verbose: true },
        ),
      ),
    ).toBe('/tmp/example.txt · from line 5')
  })

  it('suppresses the main label and renders a tag for agent output reads', () => {
    const agentOutputPath = `${getTaskOutputDir()}/task-123.output`

    expect(renderToolUseMessage({ file_path: agentOutputPath }, { verbose: false })).toBe('')
    expect(collectText(renderToolUseTag({ file_path: agentOutputPath }))).toBe(
      ' task-123',
    )
    expect(renderToolUseTag({ file_path: '/tmp/example.txt' })).toBeNull()
  })
})

describe('FileReadTool UI result labels', () => {
  it('renders deterministic labels for supported output types', () => {
    expect(
      collectText(
        renderToolResultMessage({
          type: 'text',
          file: { numLines: 1 },
        } as never),
      ),
    ).toBe('Read 1 line')

    expect(
      collectText(
        renderToolResultMessage({
          type: 'parts',
          file: { count: 2, originalSize: 2048 },
        } as never),
      ),
    ).toBe('Read 2 pages (2KB)')

    expect(
      collectText(
        renderToolResultMessage({
          type: 'pdf',
          file: { originalSize: 2048 },
        } as never),
      ),
    ).toBe('Read PDF (2KB)')

    expect(
      collectText(
        renderToolResultMessage({
          type: 'image',
          file: { originalSize: 2048 },
        } as never),
      ),
    ).toBe('Read image (2KB)')

    expect(
      collectText(
        renderToolResultMessage({
          type: 'notebook',
          file: { cells: [{}, {}, {}] },
        } as never),
      ),
    ).toBe('Read 3 cells')

    expect(
      collectText(
        renderToolResultMessage({
          type: 'file_unchanged',
        } as never),
      ),
    ).toBe('Unchanged since last read')
  })
})

describe('FileReadTool UI error labels', () => {
  it('renders compact file-not-found and wrapped error labels', () => {
    expect(
      collectText(
        renderToolUseErrorMessage(
          'File does not exist. Note: your current working directory is /tmp.',
          { verbose: false },
        ),
      ),
    ).toBe('File not found')

    expect(
      collectText(
        renderToolUseErrorMessage(
          '<tool_use_error>boom</tool_use_error>',
          { verbose: false },
        ),
      ),
    ).toBe('Error reading file')
  })
})
