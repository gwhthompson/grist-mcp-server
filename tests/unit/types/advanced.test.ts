import { describe, expect, it } from 'vitest'
import {
  fromBranded,
  safeToColId,
  safeToDocId,
  safeToTableId,
  safeToTimestamp,
  safeToWebhookId,
  toColId,
  toDocId,
  toOrgId,
  toPageId,
  toRowId,
  toSectionId,
  toTableId,
  toTimestamp,
  toViewId,
  toWebhookId,
  toWorkspaceId
} from '../../../src/types/advanced.js'

describe('Brand type converters', () => {
  describe('toDocId', () => {
    it('validates and returns DocId for valid input', () => {
      const validDocId = 'nwUhGmQzNjLJFyPpfn3Qrh'
      expect(toDocId(validDocId)).toBe(validDocId)
    })

    it('throws for invalid DocId', () => {
      expect(() => toDocId('too-short')).toThrow()
      expect(() => toDocId('')).toThrow()
    })
  })

  describe('safeToDocId', () => {
    it('returns DocId for valid input', () => {
      const validDocId = 'nwUhGmQzNjLJFyPpfn3Qrh'
      expect(safeToDocId(validDocId)).toBe(validDocId)
    })

    it('returns null for invalid input', () => {
      expect(safeToDocId('invalid')).toBeNull()
      expect(safeToDocId('')).toBeNull()
    })
  })

  describe('toTableId', () => {
    it('validates and returns TableId for valid input', () => {
      expect(toTableId('Valid_Table')).toBe('Valid_Table')
      expect(toTableId('Table1')).toBe('Table1')
    })

    it('throws for invalid TableId', () => {
      expect(() => toTableId('123invalid')).toThrow()
      expect(() => toTableId('')).toThrow()
    })
  })

  describe('safeToTableId', () => {
    it('returns TableId for valid input', () => {
      expect(safeToTableId('Valid_Table')).toBe('Valid_Table')
    })

    it('returns null for invalid input', () => {
      expect(safeToTableId('123invalid')).toBeNull()
      expect(safeToTableId('')).toBeNull()
    })
  })

  describe('toColId', () => {
    it('validates and returns ColId for valid input', () => {
      expect(toColId('Column1')).toBe('Column1')
      expect(toColId('_private')).toBe('_private')
    })

    it('throws for invalid ColId', () => {
      expect(() => toColId('gristHelper_column')).toThrow()
      expect(() => toColId('')).toThrow()
    })
  })

  describe('safeToColId', () => {
    it('returns ColId for valid input', () => {
      expect(safeToColId('Column1')).toBe('Column1')
    })

    it('returns null for invalid input', () => {
      expect(safeToColId('gristHelper_col')).toBeNull()
      expect(safeToColId('')).toBeNull()
    })
  })

  describe('toWorkspaceId', () => {
    it('returns WorkspaceId', () => {
      const result = toWorkspaceId(123)
      expect(result).toBe(123)
    })
  })

  describe('toRowId', () => {
    it('returns RowId', () => {
      const result = toRowId(42)
      expect(result).toBe(42)
    })
  })

  describe('toOrgId', () => {
    it('returns OrgId', () => {
      const result = toOrgId(1)
      expect(result).toBe(1)
    })
  })

  describe('toWebhookId', () => {
    it('validates and returns WebhookId for valid UUID', () => {
      const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      expect(toWebhookId(validUuid)).toBe(validUuid)
    })

    it('accepts uppercase UUID', () => {
      const uppercaseUuid = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
      expect(toWebhookId(uppercaseUuid)).toBe(uppercaseUuid)
    })

    it('throws for empty string', () => {
      expect(() => toWebhookId('')).toThrow('WebhookId cannot be empty')
    })

    it('throws for whitespace-only string', () => {
      expect(() => toWebhookId('   ')).toThrow('WebhookId cannot be empty')
    })

    it('throws for invalid UUID format', () => {
      expect(() => toWebhookId('not-a-uuid')).toThrow('Invalid WebhookId format')
      expect(() => toWebhookId('12345')).toThrow('Invalid WebhookId format')
    })
  })

  describe('safeToWebhookId', () => {
    it('returns WebhookId for valid UUID', () => {
      const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      expect(safeToWebhookId(validUuid)).toBe(validUuid)
    })

    it('returns null for invalid input', () => {
      expect(safeToWebhookId('')).toBeNull()
      expect(safeToWebhookId('invalid')).toBeNull()
    })
  })

  describe('toTimestamp', () => {
    it('returns Timestamp for valid input', () => {
      expect(toTimestamp(1704067200)).toBe(1704067200)
      expect(toTimestamp(0)).toBe(0)
    })

    it('throws for negative numbers', () => {
      expect(() => toTimestamp(-1)).toThrow('non-negative integer')
    })

    it('throws for non-integers', () => {
      expect(() => toTimestamp(1.5)).toThrow('non-negative integer')
    })
  })

  describe('safeToTimestamp', () => {
    it('returns Timestamp for valid input', () => {
      expect(safeToTimestamp(1704067200)).toBe(1704067200)
    })

    it('returns null for invalid input', () => {
      expect(safeToTimestamp(-1)).toBeNull()
      expect(safeToTimestamp(1.5)).toBeNull()
    })
  })

  describe('toViewId', () => {
    it('returns ViewId', () => {
      expect(toViewId(5)).toBe(5)
    })
  })

  describe('toSectionId', () => {
    it('returns SectionId', () => {
      expect(toSectionId(10)).toBe(10)
    })
  })

  describe('toPageId', () => {
    it('returns PageId', () => {
      expect(toPageId(3)).toBe(3)
    })
  })

  describe('fromBranded', () => {
    it('unwraps branded types', () => {
      const workspaceId = toWorkspaceId(42)
      const unwrapped = fromBranded(workspaceId)
      expect(unwrapped).toBe(42)
      expect(typeof unwrapped).toBe('number')
    })
  })
})
