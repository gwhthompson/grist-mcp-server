import { ValidationError } from '../../errors/ValidationError.js'
import {
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import { ConfigureWidgetOutputSchema } from '../../schemas/output-schemas.js'
import {
  type ConfigureWidgetInput,
  ConfigureWidgetSchema,
  toGristWidgetType
} from '../../schemas/pages-widgets.js'
import { validateWidgetLink } from '../../services/link-validator.js'
import {
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildUpdateLayoutAction,
  buildVerticalSplitLayout,
  buildWidgetFilterAction,
  processCreateViewSectionResults,
  serializeSortSpec
} from '../../services/pages-builder.js'
import {
  buildViewSectionUpdate,
  ViewSectionService,
  type ViewSectionUpdate,
  validateViewSectionUpdate
} from '../../services/view-section.js'
import {
  getPageByName,
  resolveColumnNameToColRef,
  resolveWidgetNameToSectionId
} from '../../services/widget-resolver.js'
import type { SectionId, ViewId } from '../../types/advanced.js'
import type { ApplyResponse, LayoutSpec, SQLQueryResponse, UserAction } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import { GristTool } from '../base/GristTool.js'
import { fetchWidgetTableMetadata, getFirstSectionId } from './shared.js'

class ConfigureWidgetTool extends GristTool<typeof ConfigureWidgetSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, ConfigureWidgetSchema)
  }

  protected async executeInternal(params: ConfigureWidgetInput) {
    const { docId, operations } = params
    const actions: UserAction[] = []
    const summary: string[] = []

    for (const op of operations) {
      switch (op.action) {
        case 'link': {
          // Get page to get viewId
          const page = await getPageByName(this.client, docId, op.page_name)

          // Resolve widget names to section IDs
          const targetSectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.target_widget
          )
          const sourceSectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.link_config.source_widget
          )

          // Resolve column references (default to 0 for table-level linking)
          let sourceColRef = 0
          let targetColRef = 0

          // Fetch widget/table metadata efficiently (1 query instead of 6)
          const metadata = await fetchWidgetTableMetadata(this.client, docId, [
            sourceSectionId,
            targetSectionId
          ])

          if (op.link_config.source_col !== undefined) {
            if (typeof op.link_config.source_col === 'number') {
              sourceColRef = op.link_config.source_col
            } else {
              const sourceMetadata = metadata.get(sourceSectionId)
              if (!sourceMetadata) {
                throw new Error(
                  `Could not find table for source widget ${op.link_config.source_widget}`
                )
              }

              sourceColRef = await resolveColumnNameToColRef(
                this.client,
                docId,
                sourceMetadata.tableId,
                op.link_config.source_col
              )
            }
          }

          if (op.link_config.target_col !== undefined) {
            if (typeof op.link_config.target_col === 'number') {
              targetColRef = op.link_config.target_col
            } else {
              const targetMetadata = metadata.get(targetSectionId)
              if (!targetMetadata) {
                throw new Error(`Could not find table for target widget ${op.target_widget}`)
              }

              targetColRef = await resolveColumnNameToColRef(
                this.client,
                docId,
                targetMetadata.tableId,
                op.link_config.target_col
              )
            }
          }

          // Validate link configuration before building action
          await validateWidgetLink(
            this.client,
            docId,
            sourceSectionId,
            targetSectionId,
            sourceColRef,
            targetColRef
          )

          // Fetch existing target section data with Zod validation
          const service = new ViewSectionService(this.client)
          const existing = await service.getViewSection(docId, targetSectionId as SectionId)

          // Build complete update payload preserving required fields
          const updatePayload = buildViewSectionUpdate(existing, {
            linkSrcSectionRef: sourceSectionId,
            linkSrcColRef: sourceColRef,
            linkTargetColRef: targetColRef
          })

          // Send update with all required INTEGER fields preserved
          actions.push(['UpdateRecord', '_grist_Views_section', targetSectionId, updatePayload])
          summary.push(
            `Linked widget "${op.target_widget}" to "${op.link_config.source_widget}" on page "${op.page_name}"`
          )
          break
        }

        case 'sort': {
          // Get page to get viewId
          const page = await getPageByName(this.client, docId, op.page_name)

          // Resolve widget name to section ID
          const sectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.widget
          )

          // Get widget's table for column name resolution
          const widgetMetadata = await fetchWidgetTableMetadata(this.client, docId, [sectionId])
          const tableMetadata = widgetMetadata.get(sectionId)
          if (!tableMetadata) {
            throw new Error(`Could not find table for widget ${op.widget}`)
          }

          // Resolve column names in sort_spec to column IDs
          const resolvedSortSpec = await this.resolveSortSpec(
            docId,
            tableMetadata.tableId,
            op.sort_spec
          )

          // Fetch existing section data with Zod validation
          const service = new ViewSectionService(this.client)
          const existing = await service.getViewSection(docId, sectionId as SectionId)

          // Build complete update payload preserving required fields
          const updatePayload = buildViewSectionUpdate(existing, {
            sortColRefs: serializeSortSpec(resolvedSortSpec)
          })

          // Send update with all required INTEGER fields preserved
          actions.push(['UpdateRecord', '_grist_Views_section', sectionId, updatePayload])
          summary.push(`Set sorting for widget "${op.widget}" on page "${op.page_name}"`)
          break
        }

        case 'filter': {
          // Get page to get viewId
          const page = await getPageByName(this.client, docId, op.page_name)

          // Resolve widget name to section ID
          const sectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.widget
          )

          // Get table for this widget
          const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
            sql: 'SELECT tableRef FROM _grist_Views_section WHERE id = ?',
            args: [sectionId]
          })

          // Extract tableRef from response - handle both nested and flat structures
          const tableRecord = first(tableResp.records, `Widget ${op.widget} table query`) as Record<
            string,
            unknown
          >
          const fields = tableRecord?.fields as Record<string, unknown> | undefined
          const tableRef = (fields?.tableRef || tableRecord?.tableRef) as number

          if (!tableRef) {
            throw new Error(`Could not find table for widget ${op.widget}`)
          }

          // Get table name
          const tableNameResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
            sql: 'SELECT tableId FROM _grist_Tables WHERE id = ?',
            args: [tableRef]
          })

          // Extract tableId from response - handle both nested and flat structures
          const tableNameRecord = first(
            tableNameResp.records,
            `Table name for tableRef ${tableRef}`
          ) as Record<string, unknown>
          const tableNameFields = tableNameRecord?.fields as Record<string, unknown> | undefined
          const tableName = (tableNameFields?.tableId || tableNameRecord?.tableId) as string

          if (!tableName) {
            throw new ValidationError(
              'widget',
              op.widget,
              `Widget "${op.widget}" references table ID ${tableRef} which does not exist in _grist_Tables. ` +
                `This usually means the widget's source table was deleted or the document metadata is corrupted. ` +
                `Try: grist_query_sql with "SELECT id, tableId FROM _grist_Tables" to verify which tables exist, ` +
                `or "SELECT id, tableRef, title FROM _grist_Views_section WHERE id = ${sectionId}" to check the widget's tableRef.`
            )
          }

          // Resolve column name to column ID
          const colRef = await resolveColumnNameToColRef(this.client, docId, tableName, op.column)

          actions.push(buildWidgetFilterAction(sectionId, colRef, op.filter_spec, op.pinned))
          summary.push(
            `Added filter on column "${op.column}" for widget "${op.widget}" on page "${op.page_name}"`
          )
          break
        }

        case 'add': {
          // Get page to get viewRef
          const page = await getPageByName(this.client, docId, op.page_name)

          // Get table reference by table name
          const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
            sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
            args: [op.table]
          })

          if (tableResp.records.length === 0) {
            throw new Error(
              `Table "${op.table}" not found. Verify table exists using grist_get_tables with docId="${docId}" first.`
            )
          }

          const tableRef = (first(tableResp.records, `Table "${op.table}"`) as { id: number }).id

          // Get current layout with Zod validation
          const service = new ViewSectionService(this.client)
          const layoutSpecStr = await service.getLayoutSpec(docId, page.viewRef as ViewId)
          const currentLayout = JSON.parse(layoutSpecStr || '{}') as LayoutSpec

          // Create new widget
          const createWidgetAction = buildCreateViewSectionAction(
            tableRef,
            page.viewRef,
            toGristWidgetType(op.widget_type), // Transform user type → Grist type
            null,
            null
          )

          // Execute to get the new section ID
          const createResp = await this.client.post<ApplyResponse>(
            `/docs/${docId}/apply`,
            [createWidgetAction],
            {
              schema: ApplyResponseSchema,
              context: `Adding widget for table ${op.table}`
            }
          )

          validateRetValues(createResp, { context: `Adding widget for table ${op.table}` })

          const results = processCreateViewSectionResults(createResp.retValues)
          if (results.length === 0) {
            throw new Error('Failed to create widget - no results returned from CreateViewSection')
          }

          // Safe: length check above guarantees results[0] exists
          const newSectionId = (results[0] as { sectionRef: number }).sectionRef

          // Build new layout based on position
          let newLayout: LayoutSpec

          if (op.position === 'replace') {
            // Replace entire layout with new widget
            newLayout = buildLeafLayout(newSectionId)
          } else if (op.position === 'right') {
            // Add as right side of horizontal split
            const firstSectionId = getFirstSectionId(currentLayout)
            newLayout = buildHorizontalSplitLayout(firstSectionId, newSectionId, 0.5)
          } else {
            // bottom - Add as bottom side of vertical split
            const firstSectionId = getFirstSectionId(currentLayout)
            newLayout = buildVerticalSplitLayout(firstSectionId, newSectionId, 0.5)
          }

          // Update layout and optionally set title
          const updateActions: UserAction[] = [buildUpdateLayoutAction(page.viewRef, newLayout)]

          if (op.title) {
            updateActions.push([
              'UpdateRecord',
              '_grist_Views_section',
              newSectionId,
              { title: op.title }
            ])
          }

          actions.push(...updateActions)
          summary.push(`Added widget "${op.title || op.table}" to page "${op.page_name}"`)
          break
        }

        case 'modify': {
          // Get page to get viewId
          const page = await getPageByName(this.client, docId, op.page_name)

          // Resolve widget name to section ID
          const sectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.widget
          )

          // Fetch existing section data with Zod validation
          const service = new ViewSectionService(this.client)
          const existing = await service.getViewSection(docId, sectionId as SectionId)

          // Build partial update object
          const partialUpdate: ViewSectionUpdate = {}

          if (op.widget_type !== undefined) {
            partialUpdate.parentKey = toGristWidgetType(op.widget_type) // Transform user type → Grist type
          }

          if (op.table !== undefined) {
            // Get table reference by table name
            const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
              sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
              args: [op.table]
            })

            if (tableResp.records.length === 0) {
              throw new Error(
                `Table "${op.table}" not found. Verify table exists using grist_get_tables with docId="${docId}" first.`
              )
            }

            partialUpdate.tableRef = (
              first(tableResp.records, `Table "${op.table}"`) as { id: number }
            ).id
          }

          if (op.title !== undefined) {
            partialUpdate.title = op.title
          }

          if (op.description !== undefined) {
            partialUpdate.description = op.description
          }

          // Handle visible_fields - set which columns are visible in the widget
          if (op.visible_fields !== undefined && op.visible_fields.length > 0) {
            // Get the widget's table name from existing metadata
            const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
              sql: `SELECT t.tableId
                    FROM _grist_Views_section vs
                    JOIN _grist_Tables t ON vs.tableRef = t.id
                    WHERE vs.id = ?`,
              args: [sectionId]
            })

            if (tableResp.records.length === 0) {
              throw new Error(`Could not find table for widget ${op.widget}`)
            }

            const tableRecord = tableResp.records[0] as { fields?: Record<string, unknown> }
            const tableId = (tableRecord.fields?.tableId ??
              (tableRecord as unknown as Record<string, unknown>).tableId) as string

            // Build field visibility actions
            const visibleFieldsActions = await this.setVisibleFields(
              docId,
              sectionId,
              tableId,
              op.visible_fields
            )
            actions.push(...visibleFieldsActions)
          }

          // Validate update
          validateViewSectionUpdate(partialUpdate)

          // Build complete update payload preserving required fields
          const updatePayload = buildViewSectionUpdate(existing, partialUpdate)

          actions.push(['UpdateRecord', '_grist_Views_section', sectionId, updatePayload])
          summary.push(`Modified widget "${op.widget}" on page "${op.page_name}"`)
          break
        }

        case 'delete': {
          // Get page to get viewId
          const page = await getPageByName(this.client, docId, op.page_name)

          // Resolve widget name to section ID
          const sectionId = await resolveWidgetNameToSectionId(
            this.client,
            docId,
            page.viewRef,
            op.widget
          )

          // Delete widget
          actions.push(['BulkRemoveRecord', '_grist_Views_section', [sectionId]])

          // Rebuild layout to remove this widget
          // Simplified: Create leaf layout with first remaining widget.
          // Future: Parse layout tree, remove node, rebalance splits
          const remainingWidgets = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
            sql: 'SELECT id FROM _grist_Views_section WHERE parentId = ? AND id != ? LIMIT 1',
            args: [page.viewRef, sectionId]
          })

          if (remainingWidgets.records.length > 0) {
            const remainingSectionId = (
              first(remainingWidgets.records, 'Remaining widget') as { id: number }
            ).id
            const newLayout = buildLeafLayout(remainingSectionId)
            actions.push(buildUpdateLayoutAction(page.viewRef, newLayout))
          }

          summary.push(`Deleted widget "${op.widget}" from page "${op.page_name}"`)
          break
        }

        default: {
          const _exhaustive: never = op
          throw new Error(`Unknown operation`)
        }
      }
    }

    // Execute all actions
    const configureResponse = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      actions,
      {
        schema: ApplyResponseSchema,
        context: `Configuring ${operations.length} widget operation(s)`
      }
    )

    validateRetValues(configureResponse, {
      context: `Configuring ${operations.length} widget operation(s)`
    })

    // Prepare response
    const structuredContent = {
      success: true,
      operationsCompleted: operations.length,
      summary
    }

    // Return raw data - GristTool.formatResponse() will handle wrapping
    return structuredContent as unknown
  }

  /**
   * Resolve column names in sort_spec to column IDs.
   *
   * Handles both formats:
   * - Numeric: [2, -3] - already column IDs, kept as-is
   * - String with flags: ["Name:emptyLast", "-Price:naturalSort"] - column names with optional prefix/suffix
   *
   * String format: ["-"]<column_name_or_id>[":flag1:flag2"]
   * - Leading "-" indicates descending sort
   * - Trailing ":flags" are preserved (emptyLast, naturalSort, orderByChoice)
   */
  private async resolveSortSpec(
    docId: string,
    tableId: string,
    sortSpec: Array<number | string>
  ): Promise<Array<number | string>> {
    const resolved: Array<number | string> = []

    for (const item of sortSpec) {
      if (typeof item === 'number') {
        // Already a column ID, keep as-is
        resolved.push(item)
      } else {
        // String format: parse prefix, column name, and flags
        const isDescending = item.startsWith('-')
        const withoutPrefix = isDescending ? item.slice(1) : item

        // Check for flags (colon-separated suffixes)
        const colonIndex = withoutPrefix.indexOf(':')
        const columnPart = colonIndex >= 0 ? withoutPrefix.slice(0, colonIndex) : withoutPrefix
        const flagsPart = colonIndex >= 0 ? withoutPrefix.slice(colonIndex) : ''

        // Check if columnPart is already numeric (a column ID as string)
        const numericValue = Number(columnPart)
        if (!Number.isNaN(numericValue) && columnPart.trim() !== '') {
          // It's a numeric column ID in string form
          const colId = isDescending ? -numericValue : numericValue
          if (flagsPart) {
            // Has flags, return as string with flags
            resolved.push(`${colId}${flagsPart}`)
          } else {
            // No flags, return as number
            resolved.push(colId)
          }
        } else {
          // It's a column name - resolve to column ID
          const colRef = await resolveColumnNameToColRef(this.client, docId, tableId, columnPart)
          const signedColRef = isDescending ? -colRef : colRef

          if (flagsPart) {
            // Has flags, return as string with flags
            resolved.push(`${signedColRef}${flagsPart}`)
          } else {
            // No flags, return as number
            resolved.push(signedColRef)
          }
        }
      }
    }

    return resolved
  }

  /**
   * Set the visible fields for a widget.
   *
   * In Grist, field visibility is presence-based:
   * - A column is visible if it has a record in `_grist_Views_section_field`
   * - Field order is controlled by `parentPos`
   *
   * This method ensures only the specified columns are visible, in the specified order.
   *
   * @param docId - Document ID
   * @param sectionId - Widget section ID
   * @param tableId - Table name for the widget
   * @param visibleFields - Array of column names to show (in display order)
   * @returns Array of UserActions to apply
   */
  private async setVisibleFields(
    docId: string,
    sectionId: number,
    tableId: string,
    visibleFields: string[]
  ): Promise<UserAction[]> {
    // 1. Get all columns in the table (colId → colRef mapping)
    const columnsResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT c.id as colRef, c.colId
            FROM _grist_Tables_column c
            JOIN _grist_Tables t ON c.parentId = t.id
            WHERE t.tableId = ?`,
      args: [tableId]
    })

    const colIdToColRef = new Map<string, number>()
    for (const record of columnsResp.records) {
      const fields = extractFields(record)
      colIdToColRef.set(fields.colId as string, fields.colRef as number)
    }

    // 2. Get existing section fields (colRef → fieldId mapping)
    const fieldsResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT f.id as fieldId, f.colRef
            FROM _grist_Views_section_field f
            WHERE f.parentId = ?`,
      args: [sectionId]
    })

    const existingFields = new Map<number, number>() // colRef → fieldId
    for (const record of fieldsResp.records) {
      const fields = extractFields(record)
      existingFields.set(fields.colRef as number, fields.fieldId as number)
    }

    // 3. Build desired colRefs list with validation
    const desiredColRefs: number[] = []
    for (const colName of visibleFields) {
      const colRef = colIdToColRef.get(colName)
      if (colRef === undefined) {
        throw new ValidationError(
          'visible_fields',
          colName,
          `Column "${colName}" not found in table "${tableId}". ` +
            `Available columns: ${[...colIdToColRef.keys()].filter((k) => !k.startsWith('gristHelper_')).join(', ')}`
        )
      }
      desiredColRefs.push(colRef)
    }

    const desiredColRefSet = new Set(desiredColRefs)
    const actions: UserAction[] = []

    // 4. Remove unwanted fields (columns not in visibleFields)
    const fieldIdsToRemove: number[] = []
    for (const [colRef, fieldId] of existingFields) {
      if (!desiredColRefSet.has(colRef)) {
        fieldIdsToRemove.push(fieldId)
      }
    }
    if (fieldIdsToRemove.length > 0) {
      actions.push(['BulkRemoveRecord', '_grist_Views_section_field', fieldIdsToRemove])
    }

    // 5. Collect fields to add and update
    const fieldsToAdd: { colRef: number; parentPos: number }[] = []
    const fieldsToUpdate: { fieldId: number; parentPos: number }[] = []
    for (let i = 0; i < desiredColRefs.length; i++) {
      const colRef = desiredColRefs[i] as number
      const fieldId = existingFields.get(colRef)
      if (fieldId !== undefined) {
        // Update position for existing field
        fieldsToUpdate.push({ fieldId, parentPos: i + 1 })
      } else {
        // Add new field
        fieldsToAdd.push({ colRef, parentPos: i + 1 })
      }
    }

    // 6. Update existing field positions using BulkUpdateRecord
    if (fieldsToUpdate.length > 0) {
      actions.push([
        'BulkUpdateRecord',
        '_grist_Views_section_field',
        fieldsToUpdate.map((f) => f.fieldId),
        { parentPos: fieldsToUpdate.map((f) => f.parentPos) }
      ])
    }

    // 7. Add missing fields using BulkAddRecord
    if (fieldsToAdd.length > 0) {
      actions.push([
        'BulkAddRecord',
        '_grist_Views_section_field',
        fieldsToAdd.map(() => null),
        {
          parentId: fieldsToAdd.map(() => sectionId),
          colRef: fieldsToAdd.map((f) => f.colRef),
          parentPos: fieldsToAdd.map((f) => f.parentPos)
        }
      ])
    }

    return actions
  }
}

export async function configureWidget(context: ToolContext, params: ConfigureWidgetInput) {
  const tool = new ConfigureWidgetTool(context)
  return tool.execute(params)
}

export const CONFIGURE_WIDGET_DEFINITION: ToolDefinition = {
  name: 'grist_configure_widget',
  title: 'Configure Widget',
  description: 'Configure widget properties, linking, sorting, and filtering',
  purpose: 'Configure widget properties, linking, sorting, and filtering',
  category: 'document_structure',
  inputSchema: ConfigureWidgetSchema,
  outputSchema: ConfigureWidgetOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,
  handler: configureWidget,
  docs: {
    overview:
      'Configures widgets on existing pages. Link widgets for master-detail relationships. ' +
      'Add sorting and filtering. Modify widget properties or delete widgets.',
    examples: [
      {
        desc: 'Link widgets',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'link',
              page_name: 'Dashboard',
              target_widget: 'Orders',
              link_config: { source_widget: 'Customers', target_col: 'CustomerRef' }
            }
          ]
        }
      },
      {
        desc: 'Sort by column IDs',
        input: {
          docId: 'abc123',
          operations: [
            { action: 'sort', page_name: 'Dashboard', widget: 'Contacts', sort_spec: [2, -3] }
          ]
        }
      },
      {
        desc: 'Sort by column names',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'sort',
              page_name: 'Dashboard',
              widget: 'Sales',
              sort_spec: ['Region', '-Amount:emptyLast']
            }
          ]
        }
      },
      {
        desc: 'Add filter',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'filter',
              page_name: 'Dashboard',
              widget: 'Sales',
              column: 'Status',
              filter_spec: { included: ['Active'] }
            }
          ]
        }
      }
    ],
    errors: [
      { error: 'Page not found', solution: 'Check page name (case-sensitive)' },
      { error: 'Widget not found', solution: 'Use widget title or section ID' }
    ]
  }
}
