/**
 * Output Schema Validation Tests
 *
 * Validates that all tool output schemas correctly match the structure
 * returned by their respective executeInternal() methods.
 *
 * These are unit tests that don't require Docker - they use mock fixtures
 * that mirror the actual tool return structures.
 */

import { describe, expect, it } from 'vitest'
import {
  AddRecordsOutputSchema,
  BuildPageOutputSchema,
  ConfigureWidgetOutputSchema,
  CreateDocumentOutputSchema,
  CreateSummaryTableOutputSchema,
  CreateTableOutputSchema,
  DeleteRecordsOutputSchema,
  DeleteTableOutputSchema,
  GetDocumentsOutputSchema,
  GetPagesOutputSchema,
  GetRecordsOutputSchema,
  GetTablesOutputSchema,
  GetWorkspacesOutputSchema,
  HelpOutputSchema,
  ManageColumnsOutputSchema,
  ManageConditionalRulesOutputSchema,
  ManageWebhooksOutputSchema,
  QuerySqlOutputSchema,
  RenameTableOutputSchema,
  UpdatePageOutputSchema,
  UpdateRecordsOutputSchema,
  UpsertRecordsOutputSchema
} from '../../../src/schemas/output-schemas.js'
import {
  AddRecordsFixtures,
  BuildPageFixtures,
  ConfigureWidgetFixtures,
  CreateDocumentFixtures,
  CreateSummaryTableFixtures,
  CreateTableFixtures,
  DeleteRecordsFixtures,
  DeleteTableFixtures,
  GetDocumentsFixtures,
  GetPagesFixtures,
  GetRecordsFixtures,
  GetTablesFixtures,
  GetWorkspacesFixtures,
  HelpFixtures,
  ManageColumnsFixtures,
  ManageConditionalRulesFixtures,
  QuerySqlFixtures,
  RenameTableFixtures,
  UpdatePageFixtures,
  UpdateRecordsFixtures,
  UpsertRecordsFixtures,
  WebhookClearQueueFixtures,
  WebhookCreateFixtures,
  WebhookDeleteFixtures,
  WebhookListFixtures,
  WebhookUpdateFixtures
} from '../../fixtures/output-schema-fixtures.js'

describe('Output Schema Validation', () => {
  // ==========================================================================
  // Discovery Tools
  // ==========================================================================

  describe('GetWorkspacesOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = GetWorkspacesOutputSchema.safeParse(GetWorkspacesFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with workspaces', () => {
      const result = GetWorkspacesOutputSchema.safeParse(GetWorkspacesFixtures.withWorkspaces)
      expect(result.success).toBe(true)
    })

    it('should reject missing required fields', () => {
      const invalid = { items: [] }
      const result = GetWorkspacesOutputSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('GetDocumentsOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = GetDocumentsOutputSchema.safeParse(GetDocumentsFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with documents', () => {
      const result = GetDocumentsOutputSchema.safeParse(GetDocumentsFixtures.withDocuments)
      expect(result.success).toBe(true)
    })

    it('should accept workspace as string or object', () => {
      const withStringWorkspace = {
        ...GetDocumentsFixtures.minimal,
        items: [
          {
            id: 'abc123',
            name: 'Test',
            workspace: 'Personal',
            access: 'owner'
          }
        ],
        total: 1
      }
      expect(GetDocumentsOutputSchema.safeParse(withStringWorkspace).success).toBe(true)

      const withObjectWorkspace = {
        ...GetDocumentsFixtures.minimal,
        items: [
          {
            id: 'abc123',
            name: 'Test',
            workspace: { id: 1, name: 'Personal' },
            access: 'owner'
          }
        ],
        total: 1
      }
      expect(GetDocumentsOutputSchema.safeParse(withObjectWorkspace).success).toBe(true)
    })
  })

  describe('GetTablesOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = GetTablesOutputSchema.safeParse(GetTablesFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with tables', () => {
      const result = GetTablesOutputSchema.safeParse(GetTablesFixtures.withTables)
      expect(result.success).toBe(true)
    })

    it('should validate full schema response', () => {
      const result = GetTablesOutputSchema.safeParse(GetTablesFixtures.fullSchema)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Reading Tools
  // ==========================================================================

  describe('GetRecordsOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = GetRecordsOutputSchema.safeParse(GetRecordsFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with records', () => {
      const result = GetRecordsOutputSchema.safeParse(GetRecordsFixtures.withRecords)
      expect(result.success).toBe(true)
    })

    it('should validate response with formula errors', () => {
      const result = GetRecordsOutputSchema.safeParse(GetRecordsFixtures.withFormulaErrors)
      expect(result.success).toBe(true)
    })
  })

  describe('QuerySqlOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = QuerySqlOutputSchema.safeParse(QuerySqlFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with results', () => {
      const result = QuerySqlOutputSchema.safeParse(QuerySqlFixtures.withResults)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Record Operation Tools
  // ==========================================================================

  describe('AddRecordsOutputSchema', () => {
    it('should validate single record response', () => {
      const result = AddRecordsOutputSchema.safeParse(AddRecordsFixtures.single)
      expect(result.success).toBe(true)
    })

    it('should validate multiple records response', () => {
      const result = AddRecordsOutputSchema.safeParse(AddRecordsFixtures.multiple)
      expect(result.success).toBe(true)
    })

    it('should reject non-true success value', () => {
      const invalid = { ...AddRecordsFixtures.single, success: false }
      const result = AddRecordsOutputSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('UpdateRecordsOutputSchema', () => {
    it('should validate basic response', () => {
      const result = UpdateRecordsOutputSchema.safeParse(UpdateRecordsFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('UpsertRecordsOutputSchema', () => {
    it('should validate basic response', () => {
      const result = UpsertRecordsOutputSchema.safeParse(UpsertRecordsFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('DeleteRecordsOutputSchema', () => {
    it('should validate basic response', () => {
      const result = DeleteRecordsOutputSchema.safeParse(DeleteRecordsFixtures.basic)
      expect(result.success).toBe(true)
    })

    it('should validate response with warning', () => {
      const result = DeleteRecordsOutputSchema.safeParse(DeleteRecordsFixtures.withWarning)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Table Operation Tools
  // ==========================================================================

  describe('CreateTableOutputSchema', () => {
    it('should validate basic response', () => {
      const result = CreateTableOutputSchema.safeParse(CreateTableFixtures.basic)
      expect(result.success).toBe(true)
    })

    it('should validate response with warnings', () => {
      const result = CreateTableOutputSchema.safeParse(CreateTableFixtures.withWarnings)
      expect(result.success).toBe(true)
    })
  })

  describe('RenameTableOutputSchema', () => {
    it('should validate basic response', () => {
      const result = RenameTableOutputSchema.safeParse(RenameTableFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('DeleteTableOutputSchema', () => {
    it('should validate basic response', () => {
      const result = DeleteTableOutputSchema.safeParse(DeleteTableFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('CreateSummaryTableOutputSchema', () => {
    it('should validate basic response', () => {
      const result = CreateSummaryTableOutputSchema.safeParse(CreateSummaryTableFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Column Operation Tools
  // ==========================================================================

  describe('ManageColumnsOutputSchema', () => {
    it('should validate single operation response', () => {
      const result = ManageColumnsOutputSchema.safeParse(ManageColumnsFixtures.singleAdd)
      expect(result.success).toBe(true)
    })

    it('should validate multiple operations response', () => {
      const result = ManageColumnsOutputSchema.safeParse(ManageColumnsFixtures.multipleOperations)
      expect(result.success).toBe(true)
    })
  })

  describe('ManageConditionalRulesOutputSchema', () => {
    it('should validate add operation response', () => {
      const result = ManageConditionalRulesOutputSchema.safeParse(
        ManageConditionalRulesFixtures.add
      )
      expect(result.success).toBe(true)
    })

    it('should validate list operation response', () => {
      const result = ManageConditionalRulesOutputSchema.safeParse(
        ManageConditionalRulesFixtures.list
      )
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Document Operation Tools
  // ==========================================================================

  describe('CreateDocumentOutputSchema', () => {
    it('should validate basic response', () => {
      const result = CreateDocumentOutputSchema.safeParse(CreateDocumentFixtures.basic)
      expect(result.success).toBe(true)
    })

    it('should validate forked document response', () => {
      const result = CreateDocumentOutputSchema.safeParse(CreateDocumentFixtures.forked)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Page/Widget Operation Tools
  // ==========================================================================

  describe('GetPagesOutputSchema', () => {
    it('should validate minimal response', () => {
      const result = GetPagesOutputSchema.safeParse(GetPagesFixtures.minimal)
      expect(result.success).toBe(true)
    })

    it('should validate response with widgets', () => {
      const result = GetPagesOutputSchema.safeParse(GetPagesFixtures.withWidgets)
      expect(result.success).toBe(true)
    })

    it('should validate response with summary tables', () => {
      const result = GetPagesOutputSchema.safeParse(GetPagesFixtures.withSummaryTables)
      expect(result.success).toBe(true)
    })

    it('should validate response with widget linking', () => {
      const result = GetPagesOutputSchema.safeParse(GetPagesFixtures.withLinking)
      expect(result.success).toBe(true)
    })

    it('should validate response with chart config', () => {
      const result = GetPagesOutputSchema.safeParse(GetPagesFixtures.withChartConfig)
      expect(result.success).toBe(true)
    })

    it('should reject old field names (id instead of page_id)', () => {
      const invalid = {
        ...GetPagesFixtures.minimal,
        pages: [{ id: 1, name: 'Test', widgets: [] }] // Wrong field names
      }
      const result = GetPagesOutputSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('should reject old widget field names (section_id instead of widget_id)', () => {
      const invalid = {
        ...GetPagesFixtures.minimal,
        pages: [
          {
            page_id: 1,
            page_name: 'Test',
            widgets: [
              {
                section_id: 1, // Wrong field name
                type: 'grid', // Wrong field name
                table_id: 'Test'
              }
            ]
          }
        ]
      }
      const result = GetPagesOutputSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('BuildPageOutputSchema', () => {
    it('should validate basic response', () => {
      const result = BuildPageOutputSchema.safeParse(BuildPageFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('ConfigureWidgetOutputSchema', () => {
    it('should validate basic response', () => {
      const result = ConfigureWidgetOutputSchema.safeParse(ConfigureWidgetFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  describe('UpdatePageOutputSchema', () => {
    it('should validate basic response', () => {
      const result = UpdatePageOutputSchema.safeParse(UpdatePageFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Webhook Operation Tools
  // ==========================================================================

  describe('ManageWebhooksOutputSchema (union type)', () => {
    describe('list operation', () => {
      it('should validate empty list response', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookListFixtures.empty)
        expect(result.success).toBe(true)
      })

      it('should validate list with webhooks', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookListFixtures.withWebhooks)
        expect(result.success).toBe(true)
      })
    })

    describe('create operation', () => {
      it('should validate create response', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookCreateFixtures.basic)
        expect(result.success).toBe(true)
      })
    })

    describe('update operation', () => {
      it('should validate update response', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookUpdateFixtures.basic)
        expect(result.success).toBe(true)
      })
    })

    describe('delete operation', () => {
      it('should validate delete response', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookDeleteFixtures.basic)
        expect(result.success).toBe(true)
      })
    })

    describe('clear_queue operation', () => {
      it('should validate clear_queue response', () => {
        const result = ManageWebhooksOutputSchema.safeParse(WebhookClearQueueFixtures.basic)
        expect(result.success).toBe(true)
      })
    })
  })

  // ==========================================================================
  // Utility Tools
  // ==========================================================================

  describe('HelpOutputSchema', () => {
    it('should validate basic response', () => {
      const result = HelpOutputSchema.safeParse(HelpFixtures.basic)
      expect(result.success).toBe(true)
    })
  })

  // ==========================================================================
  // Cross-cutting Validation Tests
  // ==========================================================================

  describe('Pagination Fields', () => {
    it('should require all pagination fields in paginated responses', () => {
      const missingPagination = {
        items: [],
        total: 0
        // Missing: offset, limit, has_more, next_offset
      }
      expect(GetWorkspacesOutputSchema.safeParse(missingPagination).success).toBe(false)
    })

    it('should allow null for next_offset when has_more is false', () => {
      const withNullNextOffset = {
        ...GetWorkspacesFixtures.minimal,
        hasMore: false,
        nextOffset: null
      }
      expect(GetWorkspacesOutputSchema.safeParse(withNullNextOffset).success).toBe(true)
    })
  })

  describe('Success Literal', () => {
    it('should require success: true literal for mutation responses', () => {
      const withFalseSuccess = { ...AddRecordsFixtures.single, success: false }
      expect(AddRecordsOutputSchema.safeParse(withFalseSuccess).success).toBe(false)

      const withStringSuccess = { ...AddRecordsFixtures.single, success: 'true' }
      expect(AddRecordsOutputSchema.safeParse(withStringSuccess).success).toBe(false)
    })
  })
})
