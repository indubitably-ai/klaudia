// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .klaudia/ folder
export const CLAUDE_FOLDER_PERMISSION_PATTERN = '/.klaudia/**'

// Permission pattern for granting session-level access to the global ~/.klaudia/ folder
export const GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = '~/.klaudia/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
