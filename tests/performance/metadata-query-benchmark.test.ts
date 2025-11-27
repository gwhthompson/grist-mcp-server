/**
 * Benchmark: Metadata Query Performance Comparison
 *
 * Compares two approaches for querying helper column formulas:
 * 1. Client-side filtering: Fetch all records, filter in code
 * 2. SQL query: Use SQL to filter at database level
 *
 * Run with: npm test tests/benchmarks/metadata-query-benchmark.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { manageConditionalRules } from '../../src/tools/conditional-formatting.js'
import type { DocId, TableId } from '../../src/types/advanced.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'

describe('Metadata Query Performance Benchmark', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId
  let tableId: TableId
  const helperColRefs: number[] = []

  beforeAll(async () => {
    await ensureGristReady()
    context = await createFullTestContext(client, {
      docName: 'Benchmark Test Doc',
      tableName: 'BenchmarkTable',
      columns: [
        { id: 'Col1', fields: { type: 'Numeric' } },
        { id: 'Col2', fields: { type: 'Numeric' } },
        { id: 'Col3', fields: { type: 'Numeric' } }
      ]
    })
    docId = context.docId
    tableId = context.tableId

    // Create some rules to get helper column refs
    const result1 = await manageConditionalRules(context.toolContext, {
      docId,
      scope: 'column',
      tableId,
      colId: 'Col1',
      operation: {
        action: 'add',
        rule: { formula: '$Col1 > 100', style: { fillColor: '#FF0000' } }
      },
      response_format: 'json'
    })

    const result2 = await manageConditionalRules(context.toolContext, {
      docId,
      scope: 'column',
      tableId,
      colId: 'Col2',
      operation: {
        action: 'add',
        rule: { formula: '$Col2 > 200', style: { fillColor: '#00FF00' } }
      },
      response_format: 'json'
    })

    // Extract helper column refs from rules
    const content1 = result1.content[0]
    const content2 = result2.content[0]
    if (content1.type === 'text' && content2.type === 'text') {
      const _data1 = JSON.parse(content1.text)
      const _data2 = JSON.parse(content2.text)

      // Get colRefs from the created rules
      const cols1 = await client.get<{
        columns: Array<{ id: string; fields: { rules?: unknown } }>
      }>(`/docs/${docId}/tables/${tableId}/columns`)
      const col1 = cols1.columns.find((c) => c.id === 'Col1')
      const col2 = cols1.columns.find((c) => c.id === 'Col2')

      if (col1?.fields.rules && Array.isArray(col1.fields.rules)) {
        helperColRefs.push(...col1.fields.rules.slice(1)) // Skip "L"
      }
      if (col2?.fields.rules && Array.isArray(col2.fields.rules)) {
        helperColRefs.push(...col2.fields.rules.slice(1)) // Skip "L"
      }
    }
  }, 60000)

  afterAll(async () => {
    await cleanupTestContext(context)
  })

  it('Benchmark: Client-side filtering (10 iterations)', async () => {
    const iterations = 10
    const timings: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()

      // Approach A: Fetch all, filter client-side
      const response = await client.get<{
        records: Array<{ id: number; fields: { formula?: string | null } }>
      }>(`/docs/${docId}/tables/_grist_Tables_column/records`)

      const formulas = helperColRefs.map((colRef) => {
        const helperCol = response.records.find((r) => r.id === colRef)
        return helperCol?.fields.formula ?? ''
      })

      const end = performance.now()
      timings.push(end - start)

      // Verify we got formulas
      expect(formulas.some((f) => f.length > 0)).toBe(true)
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length
    const min = Math.min(...timings)
    const max = Math.max(...timings)

    console.log('=== CLIENT-SIDE FILTERING ===')
    console.log(`Average: ${avg.toFixed(2)}ms`)
    console.log(`Min: ${min.toFixed(2)}ms`)
    console.log(`Max: ${max.toFixed(2)}ms`)
    console.log(`Total records fetched: ${helperColRefs.length}`)
  }, 30000)

  it('Benchmark: SQL query (10 iterations)', async () => {
    const iterations = 10
    const timings: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()

      // Approach B: SQL filter
      const sql = `SELECT id, formula FROM _grist_Tables_column WHERE id IN (${helperColRefs.join(',')})`
      const result = await client.post<{
        records: Array<{ id?: number; formula?: string | null }>
      }>(`/docs/${docId}/sql`, { sql })

      if (i === 0) {
        console.log('SQL result sample:', result.records[0])
      }

      // SQL returns nested structure: {fields: {id, formula}}
      const formulas = helperColRefs.map((colRef) => {
        const row = result.records.find((r) => {
          const record = r as {
            id?: number
            formula?: string
            fields?: { id?: number; formula?: string }
          }
          return record.id === colRef || record.fields?.id === colRef
        })
        const record = row as
          | { id?: number; formula?: string; fields?: { id?: number; formula?: string } }
          | undefined
        return record?.formula || record?.fields?.formula || ''
      })

      const end = performance.now()
      timings.push(end - start)

      // Verify we got formulas
      expect(formulas.some((f) => f.length > 0)).toBe(true)
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length
    const min = Math.min(...timings)
    const max = Math.max(...timings)

    console.log('=== SQL QUERY ===')
    console.log(`Average: ${avg.toFixed(2)}ms`)
    console.log(`Min: ${min.toFixed(2)}ms`)
    console.log(`Max: ${max.toFixed(2)}ms`)
    console.log(`Target records: ${helperColRefs.length}`)
  }, 30000)
})
