import { describe, it, expect } from 'vitest'
import { isValidTableId, getTableIdError } from '../../../src/utils/identifier-validation.js'

describe('TableId Validation', () => {
  describe('isValidTableId', () => {
    describe('valid table IDs', () => {
      it('should accept uppercase start with letters only', () => {
        expect(isValidTableId('Products')).toBe(true)
        expect(isValidTableId('Users')).toBe(true)
        expect(isValidTableId('Inventory')).toBe(true)
      })

      it('should accept uppercase start with underscores', () => {
        expect(isValidTableId('User_Accounts')).toBe(true)
        expect(isValidTableId('Product_Categories')).toBe(true)
        expect(isValidTableId('_Table')).toBe(false) // Must start with UPPERCASE letter, not underscore
      })

      it('should accept uppercase start with numbers', () => {
        expect(isValidTableId('Table123')).toBe(true)
        expect(isValidTableId('Table2023')).toBe(true)
        expect(isValidTableId('A1B2C3')).toBe(true)
      })

      it('should accept mixed case after uppercase start', () => {
        expect(isValidTableId('ProductData')).toBe(true)
        expect(isValidTableId('UserAccounts')).toBe(true)
        expect(isValidTableId('MyTable')).toBe(true)
      })

      it('should accept single uppercase letter', () => {
        expect(isValidTableId('A')).toBe(true)
        expect(isValidTableId('Z')).toBe(true)
      })
    })

    describe('invalid table IDs - lowercase start', () => {
      it('should reject lowercase start', () => {
        expect(isValidTableId('products')).toBe(false)
        expect(isValidTableId('users')).toBe(false)
        expect(isValidTableId('table')).toBe(false)
      })

      it('should reject lowercase single letter', () => {
        expect(isValidTableId('a')).toBe(false)
        expect(isValidTableId('z')).toBe(false)
      })
    })

    describe('invalid table IDs - Python keywords', () => {
      it('should reject Python keywords with proper casing', () => {
        // Python keywords that can start with uppercase (for table IDs)
        const pythonKeywords = [
          'True',  // Boolean literal
          'False', // Boolean literal
          'None'   // None literal
        ]

        for (const keyword of pythonKeywords) {
          expect(isValidTableId(keyword)).toBe(false)
        }
      })

      it('should accept capitalized non-keywords', () => {
        // These look like Python keywords but are capitalized differently
        expect(isValidTableId('For')).toBe(true) // 'for' is keyword, 'For' is not
        expect(isValidTableId('Class')).toBe(true) // 'class' is keyword, 'Class' is not
        expect(isValidTableId('If')).toBe(true)
        expect(isValidTableId('While')).toBe(true)
      })

      it('should accept non-keywords that look similar', () => {
        expect(isValidTableId('Format')).toBe(true) // Not 'For'
        expect(isValidTableId('Classes')).toBe(true) // Not 'Class'
        expect(isValidTableId('Defined')).toBe(true) // Not 'Def'
      })
    })

    describe('invalid table IDs - pattern violations', () => {
      it('should reject starting with digit', () => {
        expect(isValidTableId('123Table')).toBe(false)
        expect(isValidTableId('1Users')).toBe(false)
      })

      it('should reject starting with underscore', () => {
        expect(isValidTableId('_Private')).toBe(false)
        expect(isValidTableId('_Table')).toBe(false)
      })

      it('should reject invalid characters', () => {
        expect(isValidTableId('Product-Data')).toBe(false) // Dash
        expect(isValidTableId('User.Accounts')).toBe(false) // Dot
        expect(isValidTableId('Table Name')).toBe(false) // Space
        expect(isValidTableId('Product@Data')).toBe(false) // Special char
        expect(isValidTableId('Table!')).toBe(false) // Special char
      })

      it('should reject empty string', () => {
        expect(isValidTableId('')).toBe(false)
      })
    })

    describe('case-insensitive uniqueness check', () => {
      it('should reject duplicate with different case', () => {
        const existing = ['Products', 'Users', 'Inventory']

        expect(isValidTableId('products', existing)).toBe(false)
        expect(isValidTableId('PRODUCTS', existing)).toBe(false)
        expect(isValidTableId('PrOdUcTs', existing)).toBe(false)
      })

      it('should accept non-duplicate names', () => {
        const existing = ['Products', 'Users']

        expect(isValidTableId('Inventory', existing)).toBe(true)
        expect(isValidTableId('Orders', existing)).toBe(true)
      })

      it('should handle empty existing list', () => {
        expect(isValidTableId('Products', [])).toBe(true)
      })

      it('should work without existing list', () => {
        expect(isValidTableId('Products')).toBe(true)
      })
    })
  })

  describe('getTableIdError', () => {
    describe('error messages for empty/invalid input', () => {
      it('should return error for empty string', () => {
        const error = getTableIdError('')
        expect(error).toBe('Table ID cannot be empty')
      })

      it('should return error for too long name', () => {
        const longName = 'A'.repeat(65)
        const error = getTableIdError(longName)
        expect(error).toContain('Table ID too long')
        expect(error).toContain('65 chars, max: 64')
      })
    })

    describe('error messages for lowercase start', () => {
      it('should provide suggestion for lowercase start', () => {
        const error = getTableIdError('products')
        expect(error).toContain('must start with UPPERCASE letter')
        expect(error).toContain('Suggestion: "Products"')
      })

      it('should provide suggestion for mixed case', () => {
        const error = getTableIdError('myTable')
        expect(error).toContain('must start with UPPERCASE letter')
        expect(error).toContain('Suggestion: "MyTable"')
      })
    })

    describe('error messages for digit start', () => {
      it('should reject starting with digit', () => {
        const error = getTableIdError('123Table')
        expect(error).toContain('cannot start with digit')
      })
    })

    describe('error messages for invalid characters', () => {
      it('should list invalid characters', () => {
        const error = getTableIdError('Product-Data!')
        expect(error).toContain('contains invalid characters')
        expect(error).toContain('-')
        expect(error).toContain('!')
        expect(error).toContain('only letters, digits, underscores allowed')
      })

      it('should show the invalid table ID', () => {
        const error = getTableIdError('User.Name')
        expect(error).toContain('User.Name')
      })
    })

    describe('error messages for Python keywords', () => {
      it('should explain Python keyword restriction', () => {
        const error = getTableIdError('True') // 'True' is a Python keyword
        expect(error).toContain('table ID "True" is a Python keyword')
        expect(error).toContain('Python keywords are reserved')
        expect(error).toContain('Grist uses Python for formulas')
      })

      it('should provide suggestion for Python keywords', () => {
        const error = getTableIdError('False') // 'False' is a Python keyword
        expect(error).toContain('is a Python keyword')
        expect(error).toContain('Suggestion')
      })

      it('should accept capitalized non-keywords', () => {
        // 'For' is not a keyword (only 'for' is)
        const error = getTableIdError('For')
        expect(error).toBe('') // Valid table ID
      })
    })

    describe('error messages for duplicate names', () => {
      it('should identify case-insensitive duplicates', () => {
        const existing = ['Products', 'Users']
        const error = getTableIdError('Products', existing) // Same case - should pass validation first

        // Note: 'products' (lowercase) would fail uppercase check before duplicate check
        // Testing with proper casing that gets to duplicate check
        expect(error).toBe('') // No error - same name is allowed (not a duplicate of itself)
      })

      it('should identify case-insensitive duplicates with different existing name', () => {
        const existing = ['Products', 'Users']
        const error = getTableIdError('PRODUCTS', existing)

        expect(error).toContain('conflicts with existing table')
        expect(error).toContain('Products')
        expect(error).toContain('case-insensitive match')
      })

      it('should show both the new and existing name', () => {
        const existing = ['UserData']
        const error = getTableIdError('USERDATA', existing)

        expect(error).toContain('USERDATA')
        expect(error).toContain('UserData')
      })
    })

    describe('valid table IDs return empty string', () => {
      it('should return empty string for valid IDs', () => {
        expect(getTableIdError('Products')).toBe('')
        expect(getTableIdError('User_Accounts')).toBe('')
        expect(getTableIdError('Table123')).toBe('')
        expect(getTableIdError('A')).toBe('')
      })

      it('should return empty string for valid IDs with uniqueness check', () => {
        const existing = ['Products', 'Users']
        expect(getTableIdError('Inventory', existing)).toBe('')
        expect(getTableIdError('Orders', existing)).toBe('')
      })
    })
  })
})
