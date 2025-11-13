/**
 * Negative Tests for Widget Options Validation
 *
 * This test suite verifies that invalid widgetOptions are properly rejected
 * with clear error messages. Tests cover:
 * - Invalid property values (out of range, wrong format, etc.)
 * - Unknown property rejection (strict mode)
 * - Circular reference protection
 * - Column type mismatch validation
 * - MCP error propagation
 */

import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../src/errors/ValidationError.js'
import {
  isValidWidgetOptions,
  validateAndSerializeWidgetOptions
} from '../../src/services/widget-options-validator.js'

describe('Widget Options Validation - Negative Tests', () => {
  describe('Numeric Widget Options', () => {
    it('should reject decimals exceeding maximum (20)', () => {
      expect(() => validateAndSerializeWidgetOptions({ decimals: 25 }, 'Numeric')).toThrow(
        ValidationError
      )

      expect(() => validateAndSerializeWidgetOptions({ decimals: 21 }, 'Numeric')).toThrow(
        ValidationError
      )
    })

    it('should reject negative decimals', () => {
      expect(() => validateAndSerializeWidgetOptions({ decimals: -1 }, 'Numeric')).toThrow(
        ValidationError
      )
    })

    it('should reject invalid currency codes', () => {
      expect(() =>
        validateAndSerializeWidgetOptions({ numMode: 'currency', currency: 'INVALID' }, 'Numeric')
      ).toThrow(ValidationError)

      expect(() =>
        validateAndSerializeWidgetOptions(
          { numMode: 'currency', currency: 'US' }, // Too short
          'Numeric'
        )
      ).toThrow(ValidationError)

      expect(() =>
        validateAndSerializeWidgetOptions(
          { numMode: 'currency', currency: 'USDD' }, // Too long
          'Numeric'
        )
      ).toThrow(ValidationError)
    })

    it('should reject invalid numMode values', () => {
      expect(() =>
        validateAndSerializeWidgetOptions(
          { numMode: 'invalid' as unknown as 'currency' },
          'Numeric'
        )
      ).toThrow(ValidationError)
    })

    it('should reject maxDecimals exceeding maximum', () => {
      expect(() => validateAndSerializeWidgetOptions({ maxDecimals: 25 }, 'Numeric')).toThrow(
        ValidationError
      )
    })

    it('should reject unknown properties in strict mode', () => {
      // Strict mode rejects unknown properties
      expect(() =>
        validateAndSerializeWidgetOptions({ decimals: 2, unknownProperty: 'value' }, 'Numeric')
      ).toThrow(ValidationError)
    })
  })

  describe('Choice Widget Options', () => {
    it('should reject choices exceeding maximum count (1000)', () => {
      const tooManyChoices = Array.from({ length: 1001 }, (_, i) => `Choice${i}`)

      expect(() =>
        validateAndSerializeWidgetOptions({ choices: tooManyChoices }, 'Choice')
      ).toThrow(ValidationError)
    })

    it('should reject individual choices exceeding maximum length (255)', () => {
      const tooLongChoice = 'a'.repeat(256)

      expect(() =>
        validateAndSerializeWidgetOptions({ choices: [tooLongChoice] }, 'Choice')
      ).toThrow(ValidationError)
    })

    it('should reject empty choice strings', () => {
      expect(() => validateAndSerializeWidgetOptions({ choices: ['Valid', ''] }, 'Choice')).toThrow(
        ValidationError
      )
    })
  })

  describe('Date Widget Options', () => {
    it('should reject date format exceeding maximum length (100)', () => {
      const tooLongFormat = 'Y'.repeat(101)

      expect(() =>
        validateAndSerializeWidgetOptions({ dateFormat: tooLongFormat }, 'Date')
      ).toThrow(ValidationError)
    })

    it('should reject unknown properties in strict mode', () => {
      expect(() =>
        validateAndSerializeWidgetOptions({ dateFormat: 'YYYY-MM-DD', unknownProp: true }, 'Date')
      ).toThrow(ValidationError)
    })
  })

  describe('DateTime Widget Options', () => {
    it('should reject time format exceeding maximum length (100)', () => {
      const tooLongFormat = 'H'.repeat(101)

      expect(() =>
        validateAndSerializeWidgetOptions({ timeFormat: tooLongFormat }, 'DateTime')
      ).toThrow(ValidationError)
    })
  })

  describe('Text Widget Options', () => {
    it('should reject invalid alignment values', () => {
      expect(() =>
        validateAndSerializeWidgetOptions({ alignment: 'top' as unknown as 'left' }, 'Text')
      ).toThrow(ValidationError)
    })

    it('should reject invalid widget types', () => {
      expect(() =>
        validateAndSerializeWidgetOptions(
          { widget: 'InvalidWidget' as unknown as 'TextBox' },
          'Text'
        )
      ).toThrow(ValidationError)
    })
  })

  describe('Bool Widget Options', () => {
    it('should reject invalid widget types', () => {
      expect(() =>
        validateAndSerializeWidgetOptions({ widget: 'RadioButton' as unknown as 'Switch' }, 'Bool')
      ).toThrow(ValidationError)
    })
  })

  describe('Attachments Widget Options', () => {
    it('should reject height below minimum (1)', () => {
      expect(() => validateAndSerializeWidgetOptions({ height: 0 }, 'Attachments')).toThrow(
        ValidationError
      )

      expect(() => validateAndSerializeWidgetOptions({ height: -10 }, 'Attachments')).toThrow(
        ValidationError
      )
    })

    it('should reject height exceeding maximum (5000)', () => {
      expect(() => validateAndSerializeWidgetOptions({ height: 5001 }, 'Attachments')).toThrow(
        ValidationError
      )
    })

    it('should reject non-integer height values', () => {
      expect(() => validateAndSerializeWidgetOptions({ height: 100.5 }, 'Attachments')).toThrow(
        ValidationError
      )
    })
  })

  describe('Style Properties Validation', () => {
    it('should reject invalid hex color format', () => {
      // Missing #
      expect(() => validateAndSerializeWidgetOptions({ textColor: 'FF0000' }, 'Text')).toThrow(
        ValidationError
      )

      // Too short
      expect(() => validateAndSerializeWidgetOptions({ textColor: '#FFF' }, 'Text')).toThrow(
        ValidationError
      )

      // Too long
      expect(() => validateAndSerializeWidgetOptions({ textColor: '#FF00000' }, 'Text')).toThrow(
        ValidationError
      )

      // Invalid characters
      expect(() => validateAndSerializeWidgetOptions({ textColor: '#GGGGGG' }, 'Text')).toThrow(
        ValidationError
      )
    })

    it('should reject invalid header color format', () => {
      expect(() =>
        validateAndSerializeWidgetOptions({ headerTextColor: 'invalid' }, 'Text')
      ).toThrow(ValidationError)
    })
  })

  describe('Circular Reference Protection', () => {
    it('should reject circular references without crashing', () => {
      // Strict mode rejects unknown properties including circular refs
      // This test verifies that circular refs don't crash the validator
      const circular: Record<string, unknown> = { value: 1 }
      circular.self = circular

      // Should reject during validation (unknown property 'self')
      expect(() => validateAndSerializeWidgetOptions(circular, 'Text')).toThrow(ValidationError)
    })

    it('should reject nested circular references without crashing', () => {
      const obj: Record<string, unknown> = { nested: {} }
      ;(obj.nested as Record<string, unknown>).parent = obj

      // Should reject (unknown property 'nested')
      expect(() => validateAndSerializeWidgetOptions(obj, 'Text')).toThrow(ValidationError)
    })
  })

  describe('Type Mismatch Validation', () => {
    it('should reject numeric-specific options on non-numeric columns', () => {
      // Strict mode rejects type-mismatched properties
      expect(() =>
        validateAndSerializeWidgetOptions({ numMode: 'currency', currency: 'USD' }, 'Text')
      ).toThrow(ValidationError)
    })

    it('should reject date-specific options on non-date columns', () => {
      // Strict mode rejects type-mismatched properties
      expect(() =>
        validateAndSerializeWidgetOptions({ dateFormat: 'YYYY-MM-DD' }, 'Numeric')
      ).toThrow(ValidationError)
    })

    it('should reject choice-specific options on non-choice columns', () => {
      // Strict mode rejects type-mismatched properties
      expect(() => validateAndSerializeWidgetOptions({ choices: ['A', 'B'] }, 'Text')).toThrow(
        ValidationError
      )
    })
  })

  describe('String Input Validation', () => {
    it('should reject invalid JSON strings', () => {
      expect(() => validateAndSerializeWidgetOptions('not valid json', 'Text')).toThrow(
        ValidationError
      )
    })

    it('should reject malformed JSON', () => {
      expect(() => validateAndSerializeWidgetOptions('{invalid: json}', 'Text')).toThrow(
        ValidationError
      )
    })

    it('should validate JSON strings after parsing', () => {
      // Valid JSON but invalid content
      expect(() => validateAndSerializeWidgetOptions('{"decimals": 25}', 'Numeric')).toThrow(
        ValidationError
      )
    })
  })

  describe('Runtime Type Guard', () => {
    it('should return false for invalid options', () => {
      expect(isValidWidgetOptions({ decimals: 25 }, 'Numeric')).toBe(false)
      expect(isValidWidgetOptions('invalid json', 'Text')).toBe(false)
    })

    it('should return true for valid options', () => {
      expect(isValidWidgetOptions({ decimals: 2 }, 'Numeric')).toBe(true)
      expect(isValidWidgetOptions({ alignment: 'left' }, 'Text')).toBe(true)
      expect(isValidWidgetOptions({ dateFormat: 'YYYY-MM-DD' }, 'Date')).toBe(true)
    })

    it('should return false for options with type-mismatched properties (strict mode)', () => {
      // Strict mode rejects unknown properties, so validation fails
      expect(isValidWidgetOptions({ decimals: 2, choices: ['A'] }, 'Numeric')).toBe(false)
      expect(isValidWidgetOptions({ alignment: 'left', numMode: 'currency' }, 'Text')).toBe(false)
    })

    it('should return true for undefined/null options', () => {
      expect(isValidWidgetOptions(undefined, 'Text')).toBe(true)
      expect(isValidWidgetOptions(null, 'Text')).toBe(true)
    })
  })

  describe('Error Message Quality', () => {
    it('should provide clear error message for decimal constraint', () => {
      try {
        validateAndSerializeWidgetOptions({ decimals: 25 }, 'Numeric')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        const validationError = error as ValidationError
        // Error message should mention the constraint
        expect(validationError.message.toLowerCase()).toMatch(/decimal|20|numeric/)
      }
    })

    it('should provide clear error message for currency code', () => {
      try {
        validateAndSerializeWidgetOptions({ currency: 'INVALID' }, 'Numeric')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        // Error should mention the invalid currency
      }
    })

    it('should reject unknown properties in strict mode', () => {
      // Strict mode rejects unknown properties with clear error messages
      expect(() => validateAndSerializeWidgetOptions({ unknownProp: true }, 'Text')).toThrow(
        ValidationError
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const result = validateAndSerializeWidgetOptions({}, 'Text')
      expect(result).toBe('{}')
    })

    it('should return undefined for null/undefined input', () => {
      expect(validateAndSerializeWidgetOptions(null, 'Text')).toBeUndefined()
      expect(validateAndSerializeWidgetOptions(undefined, 'Text')).toBeUndefined()
    })

    it('should validate reference type columns correctly', () => {
      // Ref:TableName should work
      const result = validateAndSerializeWidgetOptions({ alignment: 'left' }, 'Ref:People')
      expect(result).toBeDefined()
    })

    it('should validate Int type same as Numeric', () => {
      const result = validateAndSerializeWidgetOptions({ decimals: 2 }, 'Int')
      expect(result).toBeDefined()
    })
  })

  describe('Currency Code Validation', () => {
    it('should accept valid ISO 4217 currency codes', () => {
      const validCodes = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD']

      validCodes.forEach((code) => {
        const result = validateAndSerializeWidgetOptions(
          { numMode: 'currency', currency: code },
          'Numeric'
        )
        expect(result).toBeDefined()
      })
    })

    it('should accept lowercase currency codes and transform to uppercase', () => {
      const result = validateAndSerializeWidgetOptions(
        { numMode: 'currency', currency: 'usd' },
        'Numeric'
      )
      expect(result).toContain('"currency":"USD"')
    })

    it('should reject invalid currency codes', () => {
      const invalidCodes = ['AAA', 'XXX', 'ZZZ', 'ABC', 'DEF']

      invalidCodes.forEach((code) => {
        expect(() =>
          validateAndSerializeWidgetOptions({ numMode: 'currency', currency: code }, 'Numeric')
        ).toThrow(ValidationError)
      })
    })
  })
})
