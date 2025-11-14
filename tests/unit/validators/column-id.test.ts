import { describe, expect, it } from 'vitest'
import { getColIdError, isValidColId } from '../../../src/utils/identifier-validation.js'

describe('ColumnId Validation', () => {
  describe('isValidColId', () => {
    describe('valid column IDs', () => {
      it('should accept uppercase start', () => {
        expect(isValidColId('Name')).toBe(true)
        expect(isValidColId('Email')).toBe(true)
        expect(isValidColId('ProductName')).toBe(true)
      })

      it('should accept lowercase start', () => {
        expect(isValidColId('name')).toBe(true)
        expect(isValidColId('email')).toBe(true)
        expect(isValidColId('productName')).toBe(true)
      })

      it('should accept underscore start', () => {
        expect(isValidColId('_id')).toBe(true)
        expect(isValidColId('_private')).toBe(true)
        expect(isValidColId('__internal')).toBe(true)
      })

      it('should accept mixed case and numbers', () => {
        expect(isValidColId('column1')).toBe(true)
        expect(isValidColId('data_2023')).toBe(true)
        expect(isValidColId('field_123_abc')).toBe(true)
      })

      it('should accept single letter', () => {
        expect(isValidColId('A')).toBe(true)
        expect(isValidColId('a')).toBe(true)
        expect(isValidColId('_')).toBe(true)
      })

      it('should accept snake_case', () => {
        expect(isValidColId('first_name')).toBe(true)
        expect(isValidColId('last_name')).toBe(true)
        expect(isValidColId('email_address')).toBe(true)
      })

      it('should accept camelCase', () => {
        expect(isValidColId('firstName')).toBe(true)
        expect(isValidColId('lastName')).toBe(true)
        expect(isValidColId('emailAddress')).toBe(true)
      })

      it('should accept PascalCase', () => {
        expect(isValidColId('FirstName')).toBe(true)
        expect(isValidColId('LastName')).toBe(true)
        expect(isValidColId('EmailAddress')).toBe(true)
      })
    })

    describe('invalid column IDs - Python keywords', () => {
      it('should reject lowercase Python keywords', () => {
        const pythonKeywords = [
          'for',
          'class',
          'if',
          'def',
          'return',
          'import',
          'from',
          'while',
          'with',
          'try',
          'except',
          'finally',
          'raise',
          'assert',
          'break',
          'continue',
          'pass',
          'lambda',
          'yield',
          'global',
          'nonlocal',
          'del',
          'True',
          'False',
          'None',
          'and',
          'or',
          'not',
          'in',
          'is',
          'as',
          'elif',
          'else'
        ]

        for (const keyword of pythonKeywords) {
          expect(isValidColId(keyword)).toBe(false)
        }
      })

      it('should accept non-keywords that look similar', () => {
        expect(isValidColId('format')).toBe(true) // Not 'for'
        expect(isValidColId('classes')).toBe(true) // Not 'class'
        expect(isValidColId('defined')).toBe(true) // Not 'def'
        expect(isValidColId('imported')).toBe(true) // Not 'import'
      })
    })

    describe('invalid column IDs - reserved prefixes', () => {
      it('should reject gristHelper_ prefix', () => {
        expect(isValidColId('gristHelper_Display')).toBe(false)
        expect(isValidColId('gristHelper_Column')).toBe(false)
        expect(isValidColId('gristHelper_Any')).toBe(false)
      })

      it('should accept similar names without reserved prefix', () => {
        expect(isValidColId('helper_Display')).toBe(true)
        expect(isValidColId('grist_Display')).toBe(true) // Not gristHelper_
        expect(isValidColId('DisplayHelper')).toBe(true)
      })
    })

    describe('invalid column IDs - pattern violations', () => {
      it('should reject starting with digit', () => {
        expect(isValidColId('1name')).toBe(false)
        expect(isValidColId('123column')).toBe(false)
        expect(isValidColId('9field')).toBe(false)
      })

      it('should reject invalid characters', () => {
        expect(isValidColId('first-name')).toBe(false) // Dash
        expect(isValidColId('last.name')).toBe(false) // Dot
        expect(isValidColId('email address')).toBe(false) // Space
        expect(isValidColId('data@field')).toBe(false) // Special char
        expect(isValidColId('field!')).toBe(false) // Special char
        expect(isValidColId('column#1')).toBe(false) // Special char
      })

      it('should reject empty string', () => {
        expect(isValidColId('')).toBe(false)
      })
    })

    describe('case-insensitive uniqueness check', () => {
      it('should reject duplicate with different case', () => {
        const existing = ['Name', 'Email', 'Age']

        expect(isValidColId('name', existing)).toBe(false)
        expect(isValidColId('NAME', existing)).toBe(false)
        expect(isValidColId('NaMe', existing)).toBe(false)
        expect(isValidColId('email', existing)).toBe(false)
      })

      it('should accept non-duplicate names', () => {
        const existing = ['Name', 'Email']

        expect(isValidColId('Age', existing)).toBe(true)
        expect(isValidColId('Phone', existing)).toBe(true)
        expect(isValidColId('address', existing)).toBe(true)
      })

      it('should handle empty existing list', () => {
        expect(isValidColId('Name', [])).toBe(true)
      })

      it('should work without existing list', () => {
        expect(isValidColId('Name')).toBe(true)
      })
    })
  })

  describe('getColIdError', () => {
    describe('error messages for empty/invalid input', () => {
      it('should return error for empty string', () => {
        const error = getColIdError('')
        expect(error).toBe('Column ID cannot be empty')
      })

      it('should return error for too long name', () => {
        const longName = 'a'.repeat(65)
        const error = getColIdError(longName)
        expect(error).toContain('Column ID too long')
        expect(error).toContain('65 chars, max: 64')
      })
    })

    describe('error messages for digit start', () => {
      it('should provide suggestion for digit start', () => {
        const error = getColIdError('123name')
        expect(error).toContain('cannot start with digit')
        expect(error).toContain('Suggestion: "1_23name"')
      })

      it('should suggest underscore prefix for single digit', () => {
        const error = getColIdError('1column')
        expect(error).toContain('Suggestion: "1_column"')
      })
    })

    describe('error messages for invalid start character', () => {
      it('should reject invalid start characters', () => {
        const error = getColIdError('@field')
        expect(error).toContain('must start with letter or underscore')
      })

      it('should reject dash start', () => {
        const error = getColIdError('-column')
        expect(error).toContain('must start with letter or underscore')
      })
    })

    describe('error messages for invalid characters', () => {
      it('should list invalid characters', () => {
        const error = getColIdError('first-name!')
        expect(error).toContain('contains invalid characters')
        expect(error).toContain('-')
        expect(error).toContain('!')
        expect(error).toContain('only letters, digits, underscores allowed')
      })

      it('should show the invalid column ID', () => {
        const error = getColIdError('user.email')
        expect(error).toContain('user.email')
        expect(error).toContain('.')
      })
    })

    describe('error messages for Python keywords', () => {
      it('should explain Python keyword restriction', () => {
        const error = getColIdError('for')
        expect(error).toContain('column ID "for" is a Python keyword')
        expect(error).toContain('Python keywords are reserved')
        expect(error).toContain('Grist uses Python for formulas')
      })

      it('should provide suggestion for Python keywords', () => {
        const error = getColIdError('class')
        expect(error).toContain('is a Python keyword')
        expect(error).toContain('Suggestion')
      })

      it('should accept capitalized non-keywords', () => {
        // 'Return' (capitalized) is not a keyword (only 'return' lowercase is)
        const error = getColIdError('Return')
        expect(error).toBe('') // Valid column ID
      })
    })

    describe('error messages for duplicate names', () => {
      it('should identify case-insensitive duplicates', () => {
        const existing = ['Name', 'Email']
        const error = getColIdError('name', existing)

        expect(error).toContain('conflicts with existing column')
        expect(error).toContain('Name')
        expect(error).toContain('case-insensitive match')
      })

      it('should show both the new and existing name', () => {
        const existing = ['userName']
        const error = getColIdError('USERNAME', existing)

        expect(error).toContain('USERNAME')
        expect(error).toContain('userName')
      })

      it('should explain uniqueness requirement', () => {
        const existing = ['field1']
        const error = getColIdError('FIELD1', existing)

        expect(error).toContain('must be unique ignoring case')
      })
    })

    describe('valid column IDs return empty string', () => {
      it('should return empty string for valid IDs', () => {
        expect(getColIdError('Name')).toBe('')
        expect(getColIdError('email')).toBe('')
        expect(getColIdError('_private')).toBe('')
        expect(getColIdError('field_123')).toBe('')
      })

      it('should return empty string for valid IDs with uniqueness check', () => {
        const existing = ['Name', 'Email']
        expect(getColIdError('Age', existing)).toBe('')
        expect(getColIdError('phone', existing)).toBe('')
      })
    })
  })
})
