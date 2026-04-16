import { describe, expect, it, mock } from 'bun:test'
import { importFreshSourceModule } from '../support/index.js'

function expectIncludes(haystack: string, needle: string) {
  expect(haystack.includes(needle)).toBe(true)
}

describe('FileReadTool prompt template', () => {
  it('includes line format and max line count', async () => {
    mock.module('src/utils/pdfUtils.ts', () => ({
      isPDFSupported: () => false,
    }))

    const { renderPromptTemplate, MAX_LINES_TO_READ } =
      await importFreshSourceModule<typeof import('src/tools/FileReadTool/prompt.ts')>(
        'src/tools/FileReadTool/prompt.ts',
      )

    const text = renderPromptTemplate('LINE_FORMAT', ' MAX_SIZE', ' OFFSET')
    expectIncludes(text, `reads up to ${MAX_LINES_TO_READ} lines`)
    expectIncludes(text, 'LINE_FORMAT')
    expectIncludes(text, 'MAX_SIZE')
    expectIncludes(text, 'OFFSET')
  })
})
