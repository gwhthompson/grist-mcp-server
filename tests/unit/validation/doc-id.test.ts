import { describe, expect, it } from 'vitest'
import { getDocIdError, isValidDocId } from '../../../src/utils/identifier-validation.js'

describe('DocId Validation', () => {
  describe('isValidDocId', () => {
    it.each([
      ['fdCVLvgAPAD1HXhQcGHCyz', 'real Grist document ID'],
      ['aKt7TZe8YGLp3ak8bDL8TZ', 'real Grist document ID 2'],
      ['123456789ABCDEFGHJKLMn', 'all allowed base58 chars'],
      ['PQRSTUVWXYZabcdefghjkm', 'uppercase and lowercase mix'],
      ['1234567891234567891234', 'all numbers (1-9)'],
      ['ABCDEFGHJKLMNPQRSTUVWX', 'uppercase letters only'],
      ['abcdefghjkmnpqrstuvwxy', 'lowercase letters only']
    ])('should accept valid ID: %s (%s)', (docId) => {
      expect(isValidDocId(docId)).toBe(true)
    })

    it.each([
      ['0dCVLvgAPAD1HXhQcGHCyz', 'contains zero (0)'],
      ['OdCVLvgAPAD1HXhQcGHCyz', 'contains uppercase O'],
      ['IdCVLvgAPAD1HXhQcGHCyz', 'contains uppercase I'],
      ['ldCVLvgAPAD1HXhQcGHCyz', 'contains lowercase l'],
      ['0OIl567890123456789012', 'contains all excluded chars']
    ])('should reject excluded characters: %s (%s)', (docId) => {
      expect(isValidDocId(docId)).toBe(false)
    })

    it.each([
      ['short', 'too short (5 chars)'],
      ['fdCVLvgAPAD1HXhQcGHCy', 'too short (21 chars)'],
      ['fdCVLvgAPAD1HXhQcGHCyzX', 'too long (23 chars)'],
      ['', 'empty string'],
      ['a', 'single character']
    ])('should reject wrong length: %s (%s)', (docId) => {
      expect(isValidDocId(docId)).toBe(false)
    })

    it.each([
      ['fdCVLvgAPAD1HXhQcGHC-z', 'dash'],
      ['fdCVLvgAPAD1HXhQcGHC_z', 'underscore'],
      ['fdCVLvgAPAD1 XhQcGHCyz', 'space'],
      ['fdCVLvgAPAD1HXhQcGHC@z', 'at sign'],
      ['fdCVLvgAPAD1HXhQcGHCyñ', 'Unicode']
    ])('should reject invalid characters: %s (%s)', (docId) => {
      expect(isValidDocId(docId)).toBe(false)
    })
  })

  describe('getDocIdError', () => {
    it('should return error for empty string', () => {
      expect(getDocIdError('')).toBe('Document ID cannot be empty')
    })

    it.each([
      ['short', 5, 'too short'],
      ['fdCVLvgAPAD1HXhQcGHCyzXYZ', 25, 'too long']
    ])('should explain length requirement: %s (%s)', (docId, length) => {
      const error = getDocIdError(docId)
      expect(error).toContain('must be exactly 22 characters')
      expect(error).toContain(`got: ${length}`)
      expect(error).toContain('base58 encoded')
    })

    it.each([
      ['0dCVLvgAPAD1HXhQcGHCyz', '0', 'zero'],
      ['OdCVLvgAPAD1HXhQcGHCyz', 'O', 'uppercase O'],
      ['IdCVLvgAPAD1HXhQcGHCyz', 'I', 'uppercase I'],
      ['ldCVLvgAPAD1HXhQcGHCyz', 'l', 'lowercase l']
    ])('should identify excluded character: %s (%s)', (docId, char) => {
      const error = getDocIdError(docId)
      expect(error).toContain(`contains excluded character "${char}"`)
      expect(error).toContain('Base58 excludes 0, O, I, l')
      expect(error).toContain('visual clarity')
    })

    it.each([
      ['fdCVLvgAPAD1HXhQcGHC-z', ['-']],
      ['fdCVLvgAPAD1HXhQcGHC@z', ['@']],
      ['fdCV_vg@PAD1HXhQcGHC-z', ['_', '@', '-']]
    ])('should list invalid characters: %s', (docId, chars) => {
      const error = getDocIdError(docId)
      expect(error).toContain('contains invalid characters')
      expect(error).toContain('Must be base58')
      for (const char of chars) {
        expect(error).toContain(char)
      }
    })

    it.each([
      ['fdCVLvgAPAD1HXhQcGHCyz'],
      ['aKt7TZe8YGLp3ak8bDL8TZ'],
      ['123456789ABCDEFGHJKLMN']
    ])('should return empty string for valid ID: %s', (docId) => {
      expect(getDocIdError(docId)).toBe('')
    })

    it('should check length before character validation', () => {
      const error = getDocIdError('short@')
      expect(error).toContain('must be exactly 22 characters')
    })

    it('should check excluded chars before invalid chars', () => {
      const error = getDocIdError('OdCVLvgAPAD1HXhQcGHCyz')
      expect(error).toContain('excluded character "O"')
    })
  })
})
