import { describe, expect, it } from 'bun:test'
import {
  parseFrontmatter,
  parsePositiveIntFromFrontmatter,
  splitPathInFrontmatter,
} from 'src/utils/frontmatterParser.js'

describe('frontmatterParser', () => {
  it('parses markdown frontmatter and falls back to quoting problematic yaml values', () => {
    const parsed = parseFrontmatter(`---
paths: src/*.{ts,tsx}
description: Debug: command #1
---
Body
`)

    expect(parsed.frontmatter).toEqual({
      paths: 'src/*.{ts,tsx}',
      description: 'Debug: command #1',
    })
    expect(parsed.content).toBe('Body\n')
  })

  it('splits comma-separated and brace-expanded path patterns', () => {
    expect(splitPathInFrontmatter('docs, src/*.{ts,tsx}')).toEqual([
      'docs',
      'src/*.ts',
      'src/*.tsx',
    ])
  })

  it('parses positive integers from frontmatter values', () => {
    expect(parsePositiveIntFromFrontmatter('5')).toBe(5)
    expect(parsePositiveIntFromFrontmatter(3)).toBe(3)
    expect(parsePositiveIntFromFrontmatter('0')).toBeUndefined()
  })
})
