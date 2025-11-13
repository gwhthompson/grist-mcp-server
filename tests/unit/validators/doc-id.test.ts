import { describe, it, expect } from 'vitest'
import { isValidDocId, getDocIdError } from '../../../src/utils/identifier-validation.js'

describe('DocId Validation', () => {
  describe('isValidDocId', () => {
    describe('valid document IDs', () => {
      it('should accept valid 22-character base58 IDs', () => {
        // Real Grist document IDs
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyz')).toBe(true)
        expect(isValidDocId('aKt7TZe8YGLp3ak8bDL8TZ')).toBe(true)
        expect(isValidDocId('Xb2m9ZnPqWRs4JkD7FgHNY')).toBe(true)
      })

      it('should accept IDs with allowed base58 characters', () => {
        // 22 chars, using allowed charset: 1-9, A-H, J-N, P-Z, a-k, m-z (no I, O, l, 0)
        expect(isValidDocId('123456789ABCDEFGHJKLMn')).toBe(true) // 22 chars
        expect(isValidDocId('PQRSTUVWXYZabcdefghjkm')).toBe(true) // 22 chars
        expect(isValidDocId('mnpqrstuvwxyz123456789')).toBe(true) // 22 chars
      })

      it('should accept IDs with numbers (1-9)', () => {
        expect(isValidDocId('1234567891234567891234')).toBe(true) // 22 chars, all valid
        expect(isValidDocId('9999999999999999999999')).toBe(true) // 22 chars, all valid
        expect(isValidDocId('1a2b3c4d5e6f7g8h9jkmnp')).toBe(true) // 22 chars, mixed
      })

      it('should accept IDs with uppercase letters (excluding I,O)', () => {
        expect(isValidDocId('ABCDEFGHJKLMNPQRSTUVWX')).toBe(true)
        expect(isValidDocId('YZABCDEFGHJKLMNPQRSTUV')).toBe(true)
      })

      it('should accept IDs with lowercase letters (excluding l)', () => {
        expect(isValidDocId('abcdefghjkmnpqrstuvwxy')).toBe(true)
        expect(isValidDocId('zabcdefghjkmnpqrstuvwx')).toBe(true)
      })
    })

    describe('invalid document IDs - excluded characters', () => {
      it('should reject IDs containing zero (0)', () => {
        expect(isValidDocId('0dCVLvgAPAD1HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD0HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCy0')).toBe(false)
      })

      it('should reject IDs containing uppercase O', () => {
        expect(isValidDocId('OdCVLvgAPAD1HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPADOHXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyO')).toBe(false)
      })

      it('should reject IDs containing uppercase I', () => {
        expect(isValidDocId('IdCVLvgAPAD1HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPADIHXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyI')).toBe(false)
      })

      it('should reject IDs containing lowercase l', () => {
        expect(isValidDocId('ldCVLvgAPAD1HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVlvgAPAD1HXhQcGHCyz')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyl')).toBe(false)
      })

      it('should reject all excluded characters together', () => {
        // Contains 0, O, I, l
        expect(isValidDocId('0OIl567890123456789012')).toBe(false)
      })
    })

    describe('invalid document IDs - length violations', () => {
      it('should reject IDs shorter than 22 characters', () => {
        expect(isValidDocId('short')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXh')).toBe(false) // 15 chars
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCy')).toBe(false) // 21 chars
      })

      it('should reject IDs longer than 22 characters', () => {
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyzX')).toBe(false) // 23 chars
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyzXYZ')).toBe(false) // 25 chars
      })

      it('should reject empty string', () => {
        expect(isValidDocId('')).toBe(false)
      })

      it('should reject single character', () => {
        expect(isValidDocId('a')).toBe(false)
      })
    })

    describe('invalid document IDs - invalid characters', () => {
      it('should reject IDs with special characters', () => {
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHC-z')).toBe(false) // Dash
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHC_z')).toBe(false) // Underscore
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHC.z')).toBe(false) // Dot
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHC@z')).toBe(false) // At sign
      })

      it('should reject IDs with spaces', () => {
        expect(isValidDocId('fdCVLvgAPAD1 XhQcGHCyz')).toBe(false)
      })

      it('should reject IDs with Unicode characters', () => {
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyñ')).toBe(false)
        expect(isValidDocId('fdCVLvgAPAD1HXhQcGHCyé')).toBe(false)
      })
    })
  })

  describe('getDocIdError', () => {
    describe('error messages for empty input', () => {
      it('should return error for empty string', () => {
        const error = getDocIdError('')
        expect(error).toBe('Document ID cannot be empty')
      })
    })

    describe('error messages for wrong length', () => {
      it('should explain length requirement for short IDs', () => {
        const error = getDocIdError('short')
        expect(error).toContain('must be exactly 22 characters')
        expect(error).toContain('got: 5')
        expect(error).toContain('base58 encoded')
      })

      it('should explain length requirement for long IDs', () => {
        const error = getDocIdError('fdCVLvgAPAD1HXhQcGHCyzXYZ')
        expect(error).toContain('must be exactly 22 characters')
        expect(error).toContain('got: 25')
      })

      it('should show actual length vs expected', () => {
        const id = 'abc'
        const error = getDocIdError(id)
        expect(error).toContain('22 characters')
        expect(error).toContain(`got: ${id.length}`)
      })
    })

    describe('error messages for excluded characters', () => {
      it('should identify zero (0) as excluded', () => {
        const error = getDocIdError('0dCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('contains excluded character "0"')
        expect(error).toContain('Base58 excludes 0, O, I, l for visual clarity')
      })

      it('should identify uppercase O as excluded', () => {
        const error = getDocIdError('OdCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('contains excluded character "O"')
        expect(error).toContain('Base58 excludes 0, O, I, l')
      })

      it('should identify uppercase I as excluded', () => {
        const error = getDocIdError('IdCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('contains excluded character "I"')
      })

      it('should identify lowercase l as excluded', () => {
        const error = getDocIdError('ldCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('contains excluded character "l"')
      })

      it('should explain why characters are excluded', () => {
        const error = getDocIdError('0dCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('visual clarity')
      })
    })

    describe('error messages for invalid characters', () => {
      it('should list invalid characters', () => {
        const error = getDocIdError('fdCVLvgAPAD1HXhQcGHC-z')
        expect(error).toContain('contains invalid characters')
        expect(error).toContain('-')
      })

      it('should explain valid charset', () => {
        const error = getDocIdError('fdCVLvgAPAD1HXhQcGHC@z')
        expect(error).toContain('Must be base58')
        expect(error).toContain('1-9, A-H, J-N, P-Z, a-k, m-z')
      })

      it('should list multiple invalid characters', () => {
        const error = getDocIdError('fdCV_vg@PAD1HXhQcGHC-z')
        expect(error).toContain('_')
        expect(error).toContain('@')
        expect(error).toContain('-')
      })
    })

    describe('valid document IDs return empty string', () => {
      it('should return empty string for valid IDs', () => {
        expect(getDocIdError('fdCVLvgAPAD1HXhQcGHCyz')).toBe('')
        expect(getDocIdError('aKt7TZe8YGLp3ak8bDL8TZ')).toBe('')
        expect(getDocIdError('123456789ABCDEFGHJKLMN')).toBe('')
      })

      it('should accept IDs without excluded characters', () => {
        // 22 chars, no 0, O, I, l
        expect(getDocIdError('123456789ABCDEFGHJKLMn')).toBe('') // 22 chars
        expect(getDocIdError('PQRSTUVWXYZabcdefghjkm')).toBe('') // 22 chars
      })
    })

    describe('edge cases', () => {
      it('should handle null-like values', () => {
        // TypeScript should prevent these, but test runtime behavior
        expect(getDocIdError('')).not.toBe('')
      })

      it('should check excluded chars before invalid chars', () => {
        // ID with excluded char 'O' should mention that specifically
        const error = getDocIdError('OdCVLvgAPAD1HXhQcGHCyz')
        expect(error).toContain('excluded character "O"')
      })

      it('should check length before character validation', () => {
        // Short ID with invalid char should mention length first
        const error = getDocIdError('short@')
        expect(error).toContain('must be exactly 22 characters')
      })
    })
  })
})
