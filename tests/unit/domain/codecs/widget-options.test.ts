/**
 * Unit Tests for Widget Options Codecs
 *
 * Tests bidirectional transformations using Zod 4 codecs.
 * Key property: encode(decode(x)) === x (roundtrip identity)
 *
 * Direction semantics:
 * - decode (via .parse()): User → Grist (natural → storage)
 * - encode (via z.encode()): Grist → User (storage → natural)
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ChoicesCodec,
  CurrencyCodec,
  decodeWidgetOptions,
  decodeWidgetOptionsSafe,
  encodeWidgetOptions,
  encodeWidgetOptionsSafe,
  WidgetOptionsCodec
} from '../../../../src/domain/codecs/widget-options.js'

describe('Widget Options Codecs', () => {
  // ==========================================================================
  // ChoicesCodec
  // ==========================================================================
  describe('ChoicesCodec', () => {
    describe('decode (User → Grist)', () => {
      it('should add L prefix to choices array', () => {
        const natural = ['Red', 'Green', 'Blue']
        const grist = ChoicesCodec.parse(natural)
        expect(grist).toEqual(['L', 'Red', 'Green', 'Blue'])
      })

      it('should handle empty array', () => {
        const natural: string[] = []
        const grist = ChoicesCodec.parse(natural)
        expect(grist).toEqual(['L'])
      })

      it('should handle single choice', () => {
        const natural = ['Only']
        const grist = ChoicesCodec.parse(natural)
        expect(grist).toEqual(['L', 'Only'])
      })

      it('should preserve choice order', () => {
        const natural = ['Z', 'A', 'M']
        const grist = ChoicesCodec.parse(natural)
        expect(grist).toEqual(['L', 'Z', 'A', 'M'])
      })

      it('should handle choices with special characters', () => {
        const natural = ['With Space', 'With-Dash', 'With_Underscore']
        const grist = ChoicesCodec.parse(natural)
        expect(grist).toEqual(['L', 'With Space', 'With-Dash', 'With_Underscore'])
      })
    })

    describe('encode (Grist → User)', () => {
      it('should remove L prefix from choices array', () => {
        const grist: ['L', ...string[]] = ['L', 'Red', 'Green', 'Blue']
        const natural = z.encode(ChoicesCodec, grist)
        expect(natural).toEqual(['Red', 'Green', 'Blue'])
      })

      it('should handle L-only array (empty choices)', () => {
        const grist: ['L', ...string[]] = ['L']
        const natural = z.encode(ChoicesCodec, grist)
        expect(natural).toEqual([])
      })

      it('should handle single choice', () => {
        const grist: ['L', ...string[]] = ['L', 'Only']
        const natural = z.encode(ChoicesCodec, grist)
        expect(natural).toEqual(['Only'])
      })
    })

    describe('roundtrip identity', () => {
      it('should roundtrip: encode(decode(x)) === x', () => {
        const original = ['A', 'B', 'C']
        const grist = ChoicesCodec.parse(original)
        const back = z.encode(ChoicesCodec, grist)
        expect(back).toEqual(original)
      })

      it('should roundtrip empty array', () => {
        const original: string[] = []
        const grist = ChoicesCodec.parse(original)
        const back = z.encode(ChoicesCodec, grist)
        expect(back).toEqual(original)
      })

      it('should roundtrip complex choices', () => {
        const original = ['High Priority', 'Medium-Level', 'Low_priority', '1st', '2nd']
        const grist = ChoicesCodec.parse(original)
        const back = z.encode(ChoicesCodec, grist)
        expect(back).toEqual(original)
      })
    })

    describe('validation', () => {
      it('should reject non-string array elements', () => {
        expect(() => ChoicesCodec.parse([1, 2, 3])).toThrow()
      })

      it('should reject mixed array', () => {
        expect(() => ChoicesCodec.parse(['a', 1, 'b'])).toThrow()
      })

      it('should reject non-array input', () => {
        expect(() => ChoicesCodec.parse('not an array')).toThrow()
      })
    })
  })

  // ==========================================================================
  // CurrencyCodec
  // ==========================================================================
  describe('CurrencyCodec', () => {
    describe('decode (User → Grist)', () => {
      it('should uppercase lowercase currency code', () => {
        const natural = 'usd'
        const grist = CurrencyCodec.parse(natural)
        expect(grist).toBe('USD')
      })

      it('should preserve already uppercase code', () => {
        const natural = 'EUR'
        const grist = CurrencyCodec.parse(natural)
        expect(grist).toBe('EUR')
      })

      it('should handle mixed case', () => {
        const natural = 'gBp'
        const grist = CurrencyCodec.parse(natural)
        expect(grist).toBe('GBP')
      })
    })

    describe('encode (Grist → User)', () => {
      it('should passthrough uppercase code', () => {
        const grist = 'USD'
        const natural = z.encode(CurrencyCodec, grist)
        expect(natural).toBe('USD')
      })
    })

    describe('roundtrip identity', () => {
      it('should roundtrip uppercase input', () => {
        const original = 'USD'
        const grist = CurrencyCodec.parse(original)
        const back = z.encode(CurrencyCodec, grist)
        expect(back).toBe(original)
      })

      // Note: lowercase input normalizes to uppercase, so roundtrip is uppercase
      it('should normalize lowercase to uppercase on roundtrip', () => {
        const original = 'usd'
        const grist = CurrencyCodec.parse(original)
        const back = z.encode(CurrencyCodec, grist)
        expect(back).toBe('USD') // Normalized, not original
      })
    })

    describe('validation', () => {
      it('should reject codes shorter than 3 chars', () => {
        expect(() => CurrencyCodec.parse('US')).toThrow()
      })

      it('should reject codes longer than 3 chars', () => {
        expect(() => CurrencyCodec.parse('USDD')).toThrow()
      })

      it('should reject non-string input', () => {
        expect(() => CurrencyCodec.parse(123)).toThrow()
      })
    })
  })

  // ==========================================================================
  // WidgetOptionsCodec (Full Object)
  // ==========================================================================
  describe('WidgetOptionsCodec', () => {
    describe('decode (User → Grist)', () => {
      it('should transform choices and currency', () => {
        const natural = {
          choices: ['A', 'B'],
          currency: 'usd'
        }
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist.choices).toEqual(['L', 'A', 'B'])
        expect(grist.currency).toBe('USD')
      })

      it('should passthrough fields without transformation', () => {
        const natural = {
          decimals: 2,
          numMode: 'currency' as const,
          dateFormat: 'YYYY-MM-DD',
          wrap: true
        }
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist.decimals).toBe(2)
        expect(grist.numMode).toBe('currency')
        expect(grist.dateFormat).toBe('YYYY-MM-DD')
        expect(grist.wrap).toBe(true)
      })

      it('should handle empty object', () => {
        const natural = {}
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist).toEqual({})
      })

      it('should handle only choices', () => {
        const natural = { choices: ['X', 'Y'] }
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist.choices).toEqual(['L', 'X', 'Y'])
      })

      it('should handle only currency', () => {
        const natural = { currency: 'eur' }
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist.currency).toBe('EUR')
      })

      it('should preserve extra fields via passthrough', () => {
        const natural = {
          choices: ['A'],
          customField: 'should be preserved'
        }
        const grist = WidgetOptionsCodec.parse(natural)
        expect(grist.choices).toEqual(['L', 'A'])
        expect((grist as Record<string, unknown>).customField).toBe('should be preserved')
      })
    })

    describe('encode (Grist → User)', () => {
      it('should reverse transform choices', () => {
        const grist = {
          choices: ['L', 'A', 'B'] as ['L', ...string[]],
          currency: 'USD'
        }
        const natural = z.encode(WidgetOptionsCodec, grist)
        expect(natural.choices).toEqual(['A', 'B'])
        expect(natural.currency).toBe('USD')
      })

      it('should passthrough non-transformed fields', () => {
        const grist = {
          decimals: 2,
          dateFormat: 'YYYY-MM-DD'
        }
        const natural = z.encode(WidgetOptionsCodec, grist)
        expect(natural.decimals).toBe(2)
        expect(natural.dateFormat).toBe('YYYY-MM-DD')
      })
    })

    describe('roundtrip identity', () => {
      it('should roundtrip full widget options', () => {
        const original = {
          choices: ['High', 'Medium', 'Low'],
          currency: 'USD',
          decimals: 2,
          numMode: 'currency' as const,
          dateFormat: 'YYYY-MM-DD',
          wrap: true
        }
        const grist = WidgetOptionsCodec.parse(original)
        const back = z.encode(WidgetOptionsCodec, grist)

        // Compare each field - currency is already uppercase so matches
        expect(back.choices).toEqual(original.choices)
        expect(back.currency).toBe(original.currency)
        expect(back.decimals).toBe(original.decimals)
        expect(back.numMode).toBe(original.numMode)
        expect(back.dateFormat).toBe(original.dateFormat)
        expect(back.wrap).toBe(original.wrap)
      })

      it('should roundtrip choices-only options', () => {
        const original = { choices: ['One', 'Two', 'Three'] }
        const grist = WidgetOptionsCodec.parse(original)
        const back = z.encode(WidgetOptionsCodec, grist)
        expect(back.choices).toEqual(original.choices)
      })

      it('should roundtrip empty options', () => {
        const original = {}
        const grist = WidgetOptionsCodec.parse(original)
        const back = z.encode(WidgetOptionsCodec, grist)
        expect(back).toEqual(original)
      })
    })
  })

  // ==========================================================================
  // Helper Functions
  // ==========================================================================
  describe('Helper Functions', () => {
    describe('encodeWidgetOptions / decodeWidgetOptions', () => {
      it('should encode and decode correctly', () => {
        const natural = { choices: ['A', 'B'], currency: 'usd' }
        const grist = encodeWidgetOptions(natural)
        expect(grist.choices).toEqual(['L', 'A', 'B'])
        expect(grist.currency).toBe('USD')

        const back = decodeWidgetOptions(grist)
        expect(back.choices).toEqual(['A', 'B'])
        expect(back.currency).toBe('USD')
      })
    })

    describe('encodeWidgetOptionsSafe / decodeWidgetOptionsSafe', () => {
      it('should return undefined for undefined input', () => {
        expect(encodeWidgetOptionsSafe(undefined)).toBeUndefined()
        expect(decodeWidgetOptionsSafe(undefined)).toBeUndefined()
      })

      it('should return undefined for null input', () => {
        expect(encodeWidgetOptionsSafe(null)).toBeUndefined()
        expect(decodeWidgetOptionsSafe(null)).toBeUndefined()
      })

      it('should encode/decode valid input', () => {
        const natural = { choices: ['X'] }
        const grist = encodeWidgetOptionsSafe(natural)
        expect(grist?.choices).toEqual(['L', 'X'])

        const back = decodeWidgetOptionsSafe(grist)
        expect(back?.choices).toEqual(['X'])
      })
    })
  })
})
