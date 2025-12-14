/**
 * Summary Table Integration Tests
 *
 * Tests for grist_create_summary_table tool to verify:
 * 1. Summary table persists after creation (regression test for cascade deletion bug)
 * 2. keepPage option works correctly
 * 3. Summary table is usable in other tools
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as discovery from '../../../src/tools/discovery.js'
import * as pages from '../../../src/tools/pages/index.js'
import * as summaryTables from '../../../src/tools/summary-tables/index.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'

describe('grist_create_summary_table - Persistence Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      workspaceName: 'Summary Table Test Workspace',
      docName: 'Summary Table Test Document',
      tableName: 'Products',
      columns: [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        { id: 'Category', fields: { type: 'Text', label: 'Category' } },
        { id: 'Price', fields: { type: 'Numeric', label: 'Price' } },
        { id: 'Quantity', fields: { type: 'Int', label: 'Quantity' } }
      ]
    })

    // Add sample data for summary table testing
    await addTestRecords(client, context.docId, context.tableId, [
      { fields: { Name: 'Widget A', Category: 'Electronics', Price: 99.99, Quantity: 10 } },
      { fields: { Name: 'Widget B', Category: 'Electronics', Price: 149.99, Quantity: 5 } },
      { fields: { Name: 'Gadget X', Category: 'Accessories', Price: 29.99, Quantity: 25 } },
      { fields: { Name: 'Gadget Y', Category: 'Accessories', Price: 49.99, Quantity: 15 } },
      { fields: { Name: 'Tool Z', Category: 'Tools', Price: 79.99, Quantity: 8 } }
    ])
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  }, 30000)

  describe('keepPage: false (default)', () => {
    it('should create a summary table that persists in Raw Data', async () => {
      // Create summary table without visible page (default behavior)
      const result = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Category'],
        response_format: 'json'
      })

      // Verify the response indicates success
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.summaryTableId).toBeDefined()

      const summaryTableId = result.structuredContent.summaryTableId

      // Verify the summary table exists in grist_get_tables
      const tablesResult = await discovery.getTables(context.toolContext, {
        docId: context.docId as string,
        detail_level: 'columns',
        response_format: 'json'
      })

      const tableIds = tablesResult.structuredContent.items.map((t: { id: string }) => t.id)
      expect(tableIds).toContain(summaryTableId)
    })

    it('should not create a visible page when keepPage is false', async () => {
      // Create summary table without visible page - use different groupBy to avoid reuse
      const result = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Name'], // Different column to create new summary table
        keepPage: false,
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      const summaryTableId = result.structuredContent.summaryTableId

      // Get pages with detailed info including widgets
      const pagesResult = await pages.getPages(context.toolContext, {
        docId: context.docId as string,
        detail_level: 'detailed',
        response_format: 'json'
      })

      // Verify no page/widget directly references this specific summary table
      // This is the key behavior: keepPage=false means no visible page shows the summary
      const allPages = pagesResult.structuredContent.pages as Array<{
        pageName?: string
        widgets?: Array<{ tableId?: string }>
      }>
      const pagesWithThisTable = allPages.filter((p) =>
        p.widgets?.some((w) => w.tableId === summaryTableId)
      )
      expect(pagesWithThisTable.length).toBe(0)

      // The summary table should be in raw_data_tables (not displayed on any page)
      const rawDataTables = pagesResult.structuredContent.rawDataTables as Array<{
        tableId?: string
      }>
      const summaryInRawData = rawDataTables.find((t) => t.tableId === summaryTableId)
      expect(summaryInRawData).toBeDefined()
    })

    it('should create summary table with correct aggregation columns', async () => {
      const result = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Category'],
        response_format: 'json'
      })

      // Verify columns include group-by column and aggregations
      const columns = result.structuredContent.columns as string[]
      expect(columns).toContain('Category')
      expect(columns).toContain('count')
      // Numeric columns should have SUM aggregations
    })
  })

  describe('keepPage: true', () => {
    it('should create a visible page with descriptive name', async () => {
      // Create summary table with visible page
      const result = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Category'],
        keepPage: true,
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)

      // Get pages and verify a page exists
      const pagesResult = await pages.getPages(context.toolContext, {
        docId: context.docId as string,
        detail_level: 'summary',
        response_format: 'json'
      })

      // Look for the summary page - page_name should include our summary description
      const allPages = pagesResult.structuredContent.pages as Array<{ pageName?: string }>
      const summaryPage = allPages.find((p) =>
        p.pageName?.includes('Summary: Products by Category')
      )

      expect(summaryPage).toBeDefined()
    })
  })

  describe('Summary table reuse', () => {
    it('should reuse existing summary table with same group-by columns', async () => {
      // Create first summary table
      const result1 = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Category'],
        response_format: 'json'
      })

      // Create second summary table with same group-by columns
      const result2 = await summaryTables.createSummaryTable(context.toolContext, {
        docId: context.docId as string,
        sourceTable: 'Products',
        groupByColumns: ['Category'],
        response_format: 'json'
      })

      // Grist should reuse the same summary table
      expect(result1.structuredContent.summaryTableId).toBe(
        result2.structuredContent.summaryTableId
      )
    })
  })
})
