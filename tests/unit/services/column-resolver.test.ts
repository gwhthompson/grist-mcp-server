/**
 * Unit tests for column-resolver.ts - column reference resolution
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractForeignTable,
  getColumnNameFromId,
  getColumnRef,
  isReferenceType,
  resolveVisibleCol
} from '../../../src/services/column-resolver.js'
import type { GristClient } from '../../../src/services/grist-client.js'

// Mock columns response
const mockColumnsResponse = {
  columns: [
    { id: 'Name', fields: { colRef: 1, type: 'Text' } },
    { id: 'Email', fields: { colRef: 2, type: 'Text' } },
    { id: 'Department', fields: { colRef: 3, type: 'Ref:Departments' } }
  ]
}

function createMockClient(response: unknown = mockColumnsResponse): GristClient {
  return {
    get: vi.fn().mockResolvedValue(response)
  } as unknown as GristClient
}

// =============================================================================
// Pure Functions - No mocking needed
// =============================================================================

describe('extractForeignTable', () => {
  it('extracts table from Ref type', () => {
    expect(extractForeignTable('Ref:People')).toBe('People')
  })

  it('extracts table from RefList type', () => {
    expect(extractForeignTable('RefList:Tags')).toBe('Tags')
  })

  it('returns null for non-reference types', () => {
    expect(extractForeignTable('Text')).toBe(null)
    expect(extractForeignTable('Numeric')).toBe(null)
    expect(extractForeignTable('Bool')).toBe(null)
    expect(extractForeignTable('Date')).toBe(null)
    expect(extractForeignTable('DateTime:UTC')).toBe(null)
    expect(extractForeignTable('Choice')).toBe(null)
    expect(extractForeignTable('ChoiceList')).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(extractForeignTable('')).toBe(null)
  })

  it('handles table names with special characters', () => {
    expect(extractForeignTable('Ref:My_Table_Name')).toBe('My_Table_Name')
  })

  it('handles table names with numbers', () => {
    expect(extractForeignTable('Ref:Table123')).toBe('Table123')
  })
})

describe('isReferenceType', () => {
  it('returns true for Ref types', () => {
    expect(isReferenceType('Ref:People')).toBe(true)
    expect(isReferenceType('Ref:Departments')).toBe(true)
    expect(isReferenceType('Ref:Table123')).toBe(true)
  })

  it('returns true for RefList types', () => {
    expect(isReferenceType('RefList:Tags')).toBe(true)
    expect(isReferenceType('RefList:People')).toBe(true)
  })

  it('returns false for non-reference types', () => {
    expect(isReferenceType('Text')).toBe(false)
    expect(isReferenceType('Numeric')).toBe(false)
    expect(isReferenceType('Int')).toBe(false)
    expect(isReferenceType('Bool')).toBe(false)
    expect(isReferenceType('Date')).toBe(false)
    expect(isReferenceType('DateTime:UTC')).toBe(false)
    expect(isReferenceType('Choice')).toBe(false)
    expect(isReferenceType('ChoiceList')).toBe(false)
    expect(isReferenceType('Attachments')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isReferenceType('')).toBe(false)
  })

  it('returns false for partial matches', () => {
    expect(isReferenceType('Reference')).toBe(false)
    expect(isReferenceType('RefTable')).toBe(false)
    expect(isReferenceType('MyRef:People')).toBe(false)
  })
})

// =============================================================================
// Async Functions - With mocked GristClient
// =============================================================================

describe('resolveVisibleCol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns numeric visibleCol directly', async () => {
    const client = createMockClient()
    const result = await resolveVisibleCol(client, 'doc123', 'People', 42)

    expect(result).toBe(42)
    expect(client.get).not.toHaveBeenCalled()
  })

  it('resolves string column name to colRef', async () => {
    const client = createMockClient()
    const result = await resolveVisibleCol(client, 'doc123', 'People', 'Email')

    expect(result).toBe(2) // Email has colRef 2
    expect(client.get).toHaveBeenCalledWith('/docs/doc123/tables/People/columns')
  })

  it('throws for non-existent column', async () => {
    const client = createMockClient()

    await expect(resolveVisibleCol(client, 'doc123', 'People', 'NonExistent')).rejects.toThrow(
      "Column 'NonExistent' not found in table 'People'"
    )
  })

  it('includes available columns in error message', async () => {
    const client = createMockClient()

    await expect(resolveVisibleCol(client, 'doc123', 'People', 'NonExistent')).rejects.toThrow(
      'Available columns: Name, Email, Department'
    )
  })

  it('handles API errors', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Network error'))
    } as unknown as GristClient

    await expect(resolveVisibleCol(client, 'doc123', 'People', 'Email')).rejects.toThrow(
      "Failed to resolve column 'Email' in table 'People': Network error"
    )
  })

  it('handles empty columns response', async () => {
    const client = createMockClient({ columns: [] })

    await expect(resolveVisibleCol(client, 'doc123', 'People', 'Email')).rejects.toThrow(
      'Available columns: none'
    )
  })
})

describe('getColumnNameFromId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves numeric colRef to column name', async () => {
    const client = createMockClient()
    const result = await getColumnNameFromId(client, 'doc123', 'People', 2)

    expect(result).toBe('Email')
    expect(client.get).toHaveBeenCalledWith('/docs/doc123/tables/People/columns')
  })

  it('throws for non-existent column ID', async () => {
    const client = createMockClient()

    await expect(getColumnNameFromId(client, 'doc123', 'People', 999)).rejects.toThrow(
      "Column with ID 999 not found in table 'People'"
    )
  })

  it('handles API errors', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Network error'))
    } as unknown as GristClient

    await expect(getColumnNameFromId(client, 'doc123', 'People', 1)).rejects.toThrow(
      "Failed to resolve column ID 1 in table 'People': Network error"
    )
  })
})

describe('getColumnRef', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves column name to numeric colRef', async () => {
    const client = createMockClient()
    const result = await getColumnRef(client, 'doc123', 'People', 'Email')

    expect(result).toBe(2)
    expect(client.get).toHaveBeenCalledWith('/docs/doc123/tables/People/columns')
  })

  it('throws for non-existent column name', async () => {
    const client = createMockClient()

    await expect(getColumnRef(client, 'doc123', 'People', 'NonExistent')).rejects.toThrow(
      "Column 'NonExistent' not found in table 'People'"
    )
  })

  it('includes available columns in error message', async () => {
    const client = createMockClient()

    await expect(getColumnRef(client, 'doc123', 'People', 'NonExistent')).rejects.toThrow(
      'Available columns: Name, Email, Department'
    )
  })

  it('handles API errors', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Network error'))
    } as unknown as GristClient

    await expect(getColumnRef(client, 'doc123', 'People', 'Email')).rejects.toThrow(
      "Failed to get column reference for 'Email' in table 'People': Network error"
    )
  })

  it('is case-sensitive for column names', async () => {
    const client = createMockClient()

    // 'email' should not match 'Email'
    await expect(getColumnRef(client, 'doc123', 'People', 'email')).rejects.toThrow(
      "Column 'email' not found"
    )
  })
})
