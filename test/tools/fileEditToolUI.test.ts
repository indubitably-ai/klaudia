import { describe, expect, it, mock } from 'bun:test'
import * as React from 'react'
import {
  getToolUseSummary,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  userFacingName,
} from 'src/tools/FileEditTool/UI.js'
import { getPlansDirectory } from 'src/utils/plans.js'

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

function renderLabel(result: string): string {
  const rendered = renderToolUseErrorMessage(result, {
    progressMessagesForMessage: [],
    tools: {} as never,
    verbose: false,
  })

  return collectText(rendered).replace(/\s+/g, ' ').trim()
}

describe('FileEditTool UI helpers', () => {
  it('reports user-facing names for update, create, and plan edits', () => {
    const planPath = `${getPlansDirectory()}/example.md`

    expect(userFacingName(undefined)).toBe('Update')
    expect(userFacingName({ file_path: '/tmp/file.txt', old_string: 'old' })).toBe(
      'Update',
    )
    expect(userFacingName({ file_path: '/tmp/file.txt', old_string: '' })).toBe(
      'Create',
    )
    expect(userFacingName({ file_path: planPath, old_string: 'old' })).toBe(
      'Updated plan',
    )
  })

  it('summarizes the edited file path and suppresses plan-file labels', () => {
    const planPath = `${getPlansDirectory()}/example.md`

    expect(getToolUseSummary({ file_path: '/tmp/example.txt' })).toBe('/tmp/example.txt')
    expect(collectText(renderToolUseMessage({ file_path: '/tmp/example.txt' }, { verbose: false }))).toBe('/tmp/example.txt')
    expect(collectText(renderToolUseMessage({ file_path: '/tmp/example.txt' }, { verbose: true }))).toBe('/tmp/example.txt')
    expect(renderToolUseMessage({ file_path: planPath }, { verbose: false })).toBe('')
  })
})

describe('FileEditTool UI error labels', () => {
  it('renders the read-before-edit guidance', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: File has not been read yet. Read it first before writing to it.</tool_use_error>',
      ),
    ).toBe('File must be read first')
  })

  it('renders the stale-read guidance for both validation and runtime errors', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.</tool_use_error>',
      ),
    ).toBe('File changed since it was read')

    expect(
      renderLabel(
        '<tool_use_error>File has been unexpectedly modified. Read it again before attempting to write it.</tool_use_error>',
      ),
    ).toBe('File changed since it was read')
  })

  it('renders the missing-match guidance', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: String to replace not found in file.\nString: foo</tool_use_error>',
      ),
    ).toBe('Text to replace was not found')
  })

  it('renders the ambiguous-edit guidance', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: Found 2 matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: foo</tool_use_error>',
      ),
    ).toBe('Edit was ambiguous; add more context or use replace_all')
  })

  it('renders the no-op guidance', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: No changes to make: old_string and new_string are exactly the same.</tool_use_error>',
      ),
    ).toBe('No edit needed')
  })

  it('renders the missing-file guidance', () => {
    expect(
      renderLabel(
        '<tool_use_error>InputValidationError: File does not exist. When the file does not exist, old_string must be empty. Note: your current working directory is /tmp.</tool_use_error>',
      ),
    ).toBe('File not found')
  })
})
