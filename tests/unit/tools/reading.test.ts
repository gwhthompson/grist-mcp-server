/**
 * Unit tests for reading.ts tools - schemas and exports
 */

import { describe, expect, it } from 'vitest'
import { GetRecordsSchema, QuerySQLSchema, READING_TOOLS } from '../../../src/tools/reading.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('QuerySQLSchema', () => {
  it('requires docId and sql', () => {
    const result = QuerySQLSchema.safeParse({
      docId: VALID_DOC_ID,
      sql: 'SELECT 1'
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid docId', () => {
    const result = QuerySQLSchema.safeParse({
      docId: 'short',
      sql: 'SELECT 1'
    })

    expect(result.success).toBe(false)
  })

  it('accepts pagination params', () => {
    const result = QuerySQLSchema.safeParse({
      docId: VALID_DOC_ID,
      sql: 'SELECT * FROM Test',
      limit: 10,
      offset: 5
    })

    expect(result.success).toBe(true)
  })

  it('rejects empty sql', () => {
    const result = QuerySQLSchema.safeParse({
      docId: VALID_DOC_ID,
      sql: ''
    })

    expect(result.success).toBe(false)
  })

  it('accepts response_format', () => {
    const result = QuerySQLSchema.safeParse({
      docId: VALID_DOC_ID,
      sql: 'SELECT 1',
      response_format: 'json'
    })

    expect(result.success).toBe(true)
  })
})

describe('GetRecordsSchema', () => {
  it('requires docId and tableId', () => {
    const result = GetRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      tableId: 'Users'
    })

    expect(result.success).toBe(true)
  })

  it('accepts columns as array', () => {
    const result = GetRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      tableId: 'Users',
      columns: ['name', 'email']
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid tableId', () => {
    const result = GetRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      tableId: 'lowercase'
    })

    expect(result.success).toBe(false)
  })

  it('accepts pagination params', () => {
    const result = GetRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      tableId: 'Users',
      offset: 10,
      limit: 50
    })

    expect(result.success).toBe(true)
  })

  it('rejects negative offset', () => {
    const result = GetRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      tableId: 'Users',
      offset: -1
    })

    expect(result.success).toBe(false)
  })
})

describe('READING_TOOLS', () => {
  it('exports tool definitions', () => {
    expect(READING_TOOLS.length).toBeGreaterThan(0)
  })

  it('includes grist_query_sql tool', () => {
    const sqlTool = READING_TOOLS.find((t) => t.name === 'grist_query_sql')
    expect(sqlTool).toBeDefined()
    expect(sqlTool?.category).toBe('reading')
  })

  it('includes grist_get_records tool', () => {
    const recordsTool = READING_TOOLS.find((t) => t.name === 'grist_get_records')
    expect(recordsTool).toBeDefined()
    expect(recordsTool?.category).toBe('reading')
  })

  it('all tools have complete documentation', () => {
    for (const tool of READING_TOOLS) {
      expect(tool.docs.overview).toBeDefined()
      expect(tool.docs.errors).toBeDefined()
    }
  })

  it('all tools have handler functions', () => {
    for (const tool of READING_TOOLS) {
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('all tools have inputSchema', () => {
    for (const tool of READING_TOOLS) {
      expect(tool.inputSchema).toBeDefined()
    }
  })
})
