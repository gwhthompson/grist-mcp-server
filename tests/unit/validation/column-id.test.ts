import { describe, expect, it } from 'vitest'
import { getColIdError, isValidColId } from '../../../src/utils/identifier-validation.js'

describe('ColumnId Validation', () => {
  describe('isValidColId', () => {
    it.each([
      ['Name', 'PascalCase'],
      ['email', 'lowercase'],
      ['_private', 'underscore prefix'],
      ['first_name', 'snake_case'],
      ['firstName', 'camelCase'],
      ['column1', 'with numbers'],
      ['A', 'single uppercase letter'],
      ['a', 'single lowercase letter']
    ])('should accept valid ID: %s (%s)', (colId) => {
      expect(isValidColId(colId)).toBe(true)
    })

    it.each([
      ['format', 'not "for"'],
      ['classes', 'not "class"'],
      ['defined', 'not "def"'],
      ['Return', 'capitalized keyword']
    ])('should accept non-keywords: %s (%s)', (colId) => {
      expect(isValidColId(colId)).toBe(true)
    })

    it('should reject Python keywords', () => {
      const keywords = ['for', 'class', 'if', 'def', 'return', 'True', 'False', 'None']
      for (const keyword of keywords) {
        expect(isValidColId(keyword)).toBe(false)
      }
    })

    it.each([
      ['gristHelper_Display', 'reserved prefix'],
      ['gristHelper_Column', 'reserved prefix variant']
    ])('should reject reserved prefixes: %s (%s)', (colId) => {
      expect(isValidColId(colId)).toBe(false)
    })

    it.each([
      ['helper_Display', 'similar but allowed'],
      ['grist_Display', 'not gristHelper_'],
      ['DisplayHelper', 'suffix not prefix']
    ])('should accept similar names without reserved prefix: %s (%s)', (colId) => {
      expect(isValidColId(colId)).toBe(true)
    })

    it.each([
      ['1name', 'digit start'],
      ['first-name', 'dash'],
      ['last.name', 'dot'],
      ['email address', 'space'],
      ['data@field', 'at sign'],
      ['', 'empty string']
    ])('should reject pattern violations: %s (%s)', (colId) => {
      expect(isValidColId(colId)).toBe(false)
    })

    it('should reject case-insensitive duplicates', () => {
      const existing = ['Name', 'Email']
      expect(isValidColId('name', existing)).toBe(false)
      expect(isValidColId('NAME', existing)).toBe(false)
      expect(isValidColId('email', existing)).toBe(false)
    })

    it('should accept non-duplicate names', () => {
      const existing = ['Name', 'Email']
      expect(isValidColId('Age', existing)).toBe(true)
      expect(isValidColId('Name')).toBe(true) // No existing list
    })
  })

  describe('getColIdError', () => {
    it('should return error for empty string', () => {
      expect(getColIdError('')).toBe('Column ID cannot be empty')
    })

    it('should return error for too long name', () => {
      const longName = 'a'.repeat(65)
      const error = getColIdError(longName)
      expect(error).toContain('Column ID too long')
      expect(error).toContain('65 chars, max: 64')
    })

    it.each([
      ['123name', '1_23name'],
      ['1column', '1_column']
    ])('should suggest underscore prefix for digit start: %s → %s', (input, suggestion) => {
      const error = getColIdError(input)
      expect(error).toContain('cannot start with digit')
      expect(error).toContain(`Suggestion: "${suggestion}"`)
    })

    it.each([
      ['@field', 'at sign start'],
      ['-column', 'dash start']
    ])('should reject invalid start character: %s (%s)', (colId) => {
      const error = getColIdError(colId)
      expect(error).toContain('must start with letter or underscore')
    })

    it.each([
      ['first-name!', ['-', '!']],
      ['user.email', ['.']]
    ])('should list invalid characters: %s', (colId, chars) => {
      const error = getColIdError(colId)
      expect(error).toContain('contains invalid characters')
      expect(error).toContain('only letters, digits, underscores allowed')
      for (const char of chars) {
        expect(error).toContain(char)
      }
    })

    it.each([['for'], ['class']])('should explain Python keyword restriction: %s', (keyword) => {
      const error = getColIdError(keyword)
      expect(error).toContain(`column ID "${keyword}" is a Python keyword`)
      expect(error).toContain('Python keywords are reserved')
      expect(error).toContain('Grist uses Python for formulas')
      expect(error).toContain('Suggestion')
    })

    it('should identify case-insensitive duplicates', () => {
      const existing = ['Name', 'Email']
      const error = getColIdError('name', existing)
      expect(error).toContain('conflicts with existing column')
      expect(error).toContain('Name')
      expect(error).toContain('case-insensitive match')
      expect(error).toContain('must be unique ignoring case')
    })

    it.each([
      ['Name'],
      ['email'],
      ['_private'],
      ['field_123'],
      ['Return'] // Capitalized non-keyword
    ])('should return empty string for valid ID: %s', (colId) => {
      expect(getColIdError(colId)).toBe('')
    })
  })
})
