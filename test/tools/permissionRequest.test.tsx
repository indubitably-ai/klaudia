import { describe, expect, it, mock } from 'bun:test'
import { AskUserQuestionTool } from 'src/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { BashTool } from 'src/tools/BashTool/BashTool.js'
import { ExitPlanModeV2Tool } from 'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { FileEditTool } from 'src/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from 'src/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from 'src/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from 'src/tools/GlobTool/GlobTool.js'
import { GrepTool } from 'src/tools/GrepTool/GrepTool.js'
import { EnterPlanModeTool } from 'src/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { WebFetchTool } from 'src/tools/WebFetchTool/WebFetchTool.js'

mock.module('src/utils/settings/mdm/settings.js', () => ({
  getMdmSettings: () => ({ settings: {}, errors: [] }),
  getHkcuSettings: () => ({ settings: {}, errors: [] }),
}))

describe('PermissionRequest tool contracts', () => {
  it('keeps expected user-facing names for high-traffic tools', () => {
    expect(BashTool.userFacingName({ command: 'pwd' } as never)).toBe('Bash')
    expect(FileReadTool.userFacingName({ file_path: '/tmp/x' } as never)).toBe(
      'Read',
    )
    expect(GlobTool.userFacingName({} as never)).toBe('Search')
    expect(GrepTool.userFacingName({} as never)).toBe('Search')
    expect(FileEditTool.userFacingName({ file_path: '/tmp/x', old_string: 'a' } as never)).toBe(
      'Update',
    )
    expect(FileWriteTool.userFacingName({ file_path: '/tmp/x' } as never)).toBe(
      'Write',
    )
    expect(WebFetchTool.userFacingName({} as never)).toBe('Fetch')
    expect(AskUserQuestionTool.userFacingName({} as never)).toBe('')
  })

  it('keeps plan-mode tool names intentionally blank', () => {
    expect(EnterPlanModeTool.userFacingName({} as never)).toBe('')
    expect(ExitPlanModeV2Tool.userFacingName({} as never)).toBe('')
  })

  it('keeps filesystem tools read-only and edit tools writable', () => {
    expect(FileReadTool.isReadOnly({ file_path: '/tmp/x' } as never)).toBe(true)
    expect(GlobTool.isReadOnly({} as never)).toBe(true)
    expect(GrepTool.isReadOnly({} as never)).toBe(true)
    expect(BashTool.isReadOnly({ command: 'pwd' } as never)).toBe(true)
    expect(FileEditTool.isReadOnly({} as never)).toBe(false)
    expect(FileWriteTool.isReadOnly({} as never)).toBe(false)
    expect(WebFetchTool.isReadOnly({} as never)).toBe(true)
  })
})
