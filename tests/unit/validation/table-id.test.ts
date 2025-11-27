import { describe, expect, it } from 'vitest'
import { getTableIdError, isValidTableId } from '../../../src/utils/identifier-validation.js'

describe('TableId Validation', () => {
  describe('isValidTableId', () => {
    it.each([
      ['Products', 'uppercase start with letters'],
      ['User_Accounts', 'uppercase with underscores'],
      ['Table123', 'uppercase with numbers'],
      ['ProductData', 'mixed case (PascalCase)'],
      ['A', 'single uppercase letter']
    ])('should accept valid ID: %s (%s)', (tableId) => {
      expect(isValidTableId(tableId)).toBe(true)
    })

    it.each([
      ['For', 'capitalized non-keyword'],
      ['Class', 'capitalized non-keyword'],
      ['Format', 'looks like keyword but is not'],
      ['Classes', 'plural of keyword-like']
    ])('should accept capitalized non-keywords: %s (%s)', (tableId) => {
      expect(isValidTableId(tableId)).toBe(true)
    })

    it.each([
      ['products', 'lowercase start'],
      ['myTable', 'camelCase start'],
      ['a', 'single lowercase letter']
    ])('should reject lowercase start: %s (%s)', (tableId) => {
      expect(isValidTableId(tableId)).toBe(false)
    })

    it.each([
      ['True', 'Boolean literal'],
      ['False', 'Boolean literal'],
      ['None', 'None literal']
    ])('should reject Python keywords: %s (%s)', (tableId) => {
      expect(isValidTableId(tableId)).toBe(false)
    })

    it.each([
      ['123Table', 'digit start'],
      ['_Private', 'underscore start'],
      ['Product-Data', 'dash'],
      ['User.Accounts', 'dot'],
      ['Table Name', 'space'],
      ['Product@Data', 'at sign'],
      ['', 'empty string']
    ])('should reject pattern violations: %s (%s)', (tableId) => {
      expect(isValidTableId(tableId)).toBe(false)
    })

    it('should reject case-insensitive duplicates', () => {
      const existing = ['Products', 'Users']
      expect(isValidTableId('products', existing)).toBe(false)
      expect(isValidTableId('PRODUCTS', existing)).toBe(false)
      expect(isValidTableId('PrOdUcTs', existing)).toBe(false)
    })

    it('should accept non-duplicate names', () => {
      const existing = ['Products', 'Users']
      expect(isValidTableId('Inventory', existing)).toBe(true)
      expect(isValidTableId('Products')).toBe(true) // No existing list
    })
  })

  describe('getTableIdError', () => {
    it('should return error for empty string', () => {
      expect(getTableIdError('')).toBe('Table ID cannot be empty')
    })

    it('should return error for too long name', () => {
      const longName = 'A'.repeat(65)
      const error = getTableIdError(longName)
      expect(error).toContain('Table ID too long')
      expect(error).toContain('65 chars, max: 64')
    })

    it.each([
      ['products', 'Products'],
      ['myTable', 'MyTable']
    ])('should suggest capitalization for lowercase start: %s → %s', (input, suggestion) => {
      const error = getTableIdError(input)
      expect(error).toContain('must start with UPPERCASE letter')
      expect(error).toContain(`Suggestion: "${suggestion}"`)
    })

    it('should reject starting with digit', () => {
      const error = getTableIdError('123Table')
      expect(error).toContain('cannot start with digit')
    })

    it.each([
      ['Product-Data!', ['-', '!']],
      ['User.Name', ['.']]
    ])('should list invalid characters: %s', (tableId, chars) => {
      const error = getTableIdError(tableId)
      expect(error).toContain('contains invalid characters')
      expect(error).toContain('only letters, digits, underscores allowed')
      for (const char of chars) {
        expect(error).toContain(char)
      }
    })

    it.each([
      ['True', 'Boolean literal'],
      ['False', 'Boolean literal']
    ])('should explain Python keyword restriction: %s (%s)', (keyword) => {
      const error = getTableIdError(keyword)
      expect(error).toContain(`table ID "${keyword}" is a Python keyword`)
      expect(error).toContain('Python keywords are reserved')
      expect(error).toContain('Grist uses Python for formulas')
      expect(error).toContain('Suggestion')
    })

    it('should identify case-insensitive duplicates', () => {
      const existing = ['Products', 'Users']
      const error = getTableIdError('PRODUCTS', existing)
      expect(error).toContain('conflicts with existing table')
      expect(error).toContain('Products')
      expect(error).toContain('case-insensitive match')
    })

    it.each([
      ['Products'],
      ['User_Accounts'],
      ['Table123'],
      ['For'] // Capitalized non-keyword
    ])('should return empty string for valid ID: %s', (tableId) => {
      expect(getTableIdError(tableId)).toBe('')
    })
  })
})
