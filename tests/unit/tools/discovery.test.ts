/**
 * Unit tests for discovery.ts tools - schemas and exports
 */

import { describe, expect, it } from 'vitest'
import {
  DISCOVERY_TOOLS,
  GetDocumentsSchema,
  GetTablesSchema,
  GetWorkspacesSchema
} from '../../../src/tools/discovery.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('GetWorkspacesSchema', () => {
  it('allows empty params', () => {
    const result = GetWorkspacesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts detail_level summary', () => {
    const result = GetWorkspacesSchema.safeParse({ detail_level: 'summary' })
    expect(result.success).toBe(true)
  })

  it('accepts detail_level detailed', () => {
    const result = GetWorkspacesSchema.safeParse({ detail_level: 'detailed' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid detail_level', () => {
    const result = GetWorkspacesSchema.safeParse({ detail_level: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('accepts pagination params', () => {
    const result = GetWorkspacesSchema.safeParse({
      limit: 10,
      offset: 5
    })
    expect(result.success).toBe(true)
  })

  it('accepts response_format', () => {
    const result = GetWorkspacesSchema.safeParse({
      response_format: 'json'
    })
    expect(result.success).toBe(true)
  })
})

describe('GetDocumentsSchema', () => {
  it('allows empty params', () => {
    const result = GetDocumentsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts workspaceId', () => {
    const result = GetDocumentsSchema.safeParse({ workspaceId: 123 })
    expect(result.success).toBe(true)
  })

  it('accepts name_contains for filtering', () => {
    const result = GetDocumentsSchema.safeParse({ name_contains: 'test' })
    expect(result.success).toBe(true)
  })

  it('accepts pagination params', () => {
    const result = GetDocumentsSchema.safeParse({
      limit: 20,
      offset: 0
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative workspaceId', () => {
    const result = GetDocumentsSchema.safeParse({ workspaceId: -1 })
    expect(result.success).toBe(false)
  })
})

describe('GetTablesSchema', () => {
  it('requires docId', () => {
    const result = GetTablesSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid docId', () => {
    const result = GetTablesSchema.safeParse({ docId: VALID_DOC_ID })
    expect(result.success).toBe(true)
  })

  it('accepts tableId filter', () => {
    const result = GetTablesSchema.safeParse({ docId: VALID_DOC_ID, tableId: 'Users' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid tableId', () => {
    const result = GetTablesSchema.safeParse({ docId: VALID_DOC_ID, tableId: 'lowercase' })
    expect(result.success).toBe(false)
  })

  it('accepts detail_level names', () => {
    const result = GetTablesSchema.safeParse({
      docId: VALID_DOC_ID,
      detail_level: 'names'
    })
    expect(result.success).toBe(true)
  })

  it('accepts detail_level columns', () => {
    const result = GetTablesSchema.safeParse({
      docId: VALID_DOC_ID,
      detail_level: 'columns'
    })
    expect(result.success).toBe(true)
  })

  it('accepts detail_level full_schema', () => {
    const result = GetTablesSchema.safeParse({
      docId: VALID_DOC_ID,
      detail_level: 'full_schema'
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid docId', () => {
    const result = GetTablesSchema.safeParse({ docId: 'short' })
    expect(result.success).toBe(false)
  })
})

describe('DISCOVERY_TOOLS', () => {
  it('exports tool definitions', () => {
    expect(DISCOVERY_TOOLS.length).toBeGreaterThan(0)
  })

  it('includes grist_get_workspaces tool', () => {
    const tool = DISCOVERY_TOOLS.find((t) => t.name === 'grist_get_workspaces')
    expect(tool).toBeDefined()
    expect(tool?.category).toBe('discovery')
  })

  it('includes grist_get_documents tool', () => {
    const tool = DISCOVERY_TOOLS.find((t) => t.name === 'grist_get_documents')
    expect(tool).toBeDefined()
    expect(tool?.category).toBe('discovery')
  })

  it('includes grist_get_tables tool', () => {
    const tool = DISCOVERY_TOOLS.find((t) => t.name === 'grist_get_tables')
    expect(tool).toBeDefined()
    expect(tool?.category).toBe('discovery')
  })

  it('all tools have documentation', () => {
    for (const tool of DISCOVERY_TOOLS) {
      expect(tool.docs.overview).toBeDefined()
      expect(tool.docs.errors.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('all tools have handler functions', () => {
    for (const tool of DISCOVERY_TOOLS) {
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('all tools have inputSchema', () => {
    for (const tool of DISCOVERY_TOOLS) {
      expect(tool.inputSchema).toBeDefined()
    }
  })
})
