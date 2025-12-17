/**
 * Conditional Formatting Tool (INTERNAL - NOT REGISTERED)
 *
 * @deprecated This tool is NOT registered in ALL_TOOLS and is kept only for testing purposes.
 * Production code should use grist_manage_schema instead:
 * - Row rules: update_table operation with rowRules
 * - Column rules: modify_column with style.rulesOptions
 * - Field rules: modify_column with style.rulesOptions[].sectionId
 *
 * Manages conditional formatting rules across all three Grist scopes:
 * - row: Format entire rows in the Raw Data view
 * - column: Format column cells across all views
 * - field: Format column in one specific widget only
 */

import type { z } from 'zod'
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import {
  type ConditionalRulesInput,
  ConditionalRulesInputSchema,
  isColumnScope,
  isFieldScope,
  isRowScope
} from '../schemas/conditional-rules.js'
import { ManageConditionalRulesOutputSchema } from '../schemas/output-schemas.js'
import {
  ConditionalFormattingService,
  type OwnerLookupParams,
  type RuleOperationResult,
  type RuleRemoveResult,
  type RuleScope
} from '../services/conditional-formatting/index.js'
import {
  resolvePageNameToViewId,
  resolveWidgetNameToSectionId
} from '../services/widget-resolver.js'
import { toColId, toDocId, toTableId } from '../types/advanced.js'
import type { MCPToolResponse } from '../types.js'
import { GristTool } from './base/GristTool.js'

type ToolInput = z.infer<typeof ConditionalRulesInputSchema>

/** Output type matching ManageConditionalRulesOutputSchema */
interface ConditionalRulesOutput {
  success: true
  docId: string
  tableId: string
  scope: string
  action: string
  rulesCount?: number
  rules?: Array<{
    index: number
    formula: string
    style: Record<string, unknown>
  }>
}

export class ConditionalFormattingTool extends GristTool<
  typeof ConditionalRulesInputSchema,
  ConditionalRulesOutput
> {
  constructor(context: ToolContext) {
    super(context, ConditionalRulesInputSchema)
  }

  protected async executeInternal(params: ToolInput): Promise<ConditionalRulesOutput> {
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)

    // Determine scope and build owner params
    const scope = this.getScope(params)
    const ownerParams = await this.buildOwnerParams(params, docId)

    // Create service for this scope
    const service = new ConditionalFormattingService(this.client, scope)

    // Execute operation and transform to output schema
    const action = params.operation.action

    switch (action) {
      case 'add': {
        const result = await service.addRule(docId, tableId, ownerParams, params.operation.rule)
        return this.transformOperationResult(docId, tableId, scope, action, result)
      }

      case 'update': {
        const result = await service.updateRule(
          docId,
          tableId,
          ownerParams,
          params.operation.ruleIndex,
          params.operation.rule
        )
        return this.transformOperationResult(docId, tableId, scope, action, result)
      }

      case 'remove': {
        const result = await service.removeRule(
          docId,
          tableId,
          ownerParams,
          params.operation.ruleIndex
        )
        return this.transformRemoveResult(docId, tableId, scope, result)
      }

      case 'list': {
        const result = await service.listRules(docId, tableId, ownerParams)
        return this.transformOperationResult(docId, tableId, scope, action, result)
      }

      default: {
        const _exhaustive: never = params.operation
        throw new Error(`Unknown operation: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }

  /**
   * Transform RuleOperationResult to output schema format
   */
  private transformOperationResult(
    docId: string,
    tableId: string,
    scope: RuleScope,
    action: string,
    result: RuleOperationResult
  ): ConditionalRulesOutput {
    return {
      success: true,
      docId: docId,
      tableId: tableId,
      scope,
      action,
      rulesCount: result.totalRules,
      rules: result.rules.map((r) => ({
        index: r.index,
        formula: r.formula,
        style: r.style as Record<string, unknown>
      }))
    }
  }

  /**
   * Transform RuleRemoveResult to output schema format
   */
  private transformRemoveResult(
    docId: string,
    tableId: string,
    scope: RuleScope,
    result: RuleRemoveResult
  ): ConditionalRulesOutput {
    return {
      success: true,
      docId: docId,
      tableId: tableId,
      scope,
      action: 'remove',
      rulesCount: result.remainingRules
    }
  }

  /**
   * Get scope from discriminated union
   */
  private getScope(params: ToolInput): RuleScope {
    return params.scope
  }

  /**
   * Build owner lookup params based on scope
   */
  private async buildOwnerParams(
    params: ConditionalRulesInput,
    docId: string
  ): Promise<OwnerLookupParams> {
    if (isColumnScope(params)) {
      return {
        tableId: toTableId(params.tableId),
        colId: toColId(params.colId)
      }
    }

    if (isRowScope(params)) {
      // Row rules apply to the table's Raw Data view section
      // No widget ID needed - RowRuleOwner looks up rawViewSectionRef from tableId
      return {
        tableId: toTableId(params.tableId)
      }
    }

    if (isFieldScope(params)) {
      const sectionId = await this.resolveSectionId(
        docId,
        params.sectionId,
        params.pageName,
        params.widgetTitle
      )
      return {
        tableId: toTableId(params.tableId),
        sectionId,
        fieldColId: toColId(params.colId)
      }
    }

    throw new Error('Invalid scope')
  }

  /**
   * Resolve sectionId from either direct ID or page+widget names
   */
  private async resolveSectionId(
    docId: string,
    sectionId?: number,
    pageName?: string,
    widgetTitle?: string
  ): Promise<number> {
    // If sectionId provided directly, use it
    if (sectionId !== undefined) {
      return sectionId
    }

    // Otherwise resolve from page + widget names
    if (!pageName || !widgetTitle) {
      throw new Error('Either sectionId OR both pageName and widgetTitle are required')
    }

    const viewId = await resolvePageNameToViewId(this.client, docId, pageName)
    return await resolveWidgetNameToSectionId(this.client, docId, viewId, widgetTitle)
  }
}

export async function manageConditionalRules(
  context: ToolContext,
  params: ConditionalRulesInput
): Promise<MCPToolResponse> {
  const tool = new ConditionalFormattingTool(context)
  return await tool.execute(params)
}

// Export schema for registry
export { ConditionalRulesInputSchema as ManageConditionalRulesSchema }

// Tool definitions with complete documentation
export const CONDITIONAL_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_manage_conditional_rules',
    title: 'Manage Conditional Rules',
    description: 'Add, update, remove, or list conditional formatting rules',
    purpose: 'Add visual formatting rules that highlight cells based on conditions',
    category: 'columns',
    inputSchema: ConditionalRulesInputSchema,
    outputSchema: ManageConditionalRulesOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageConditionalRules,
    docs: {
      overview:
        'Manage conditional formatting rules across three scopes:\n' +
        '- **column**: Rules apply to column cells across ALL views\n' +
        '- **row**: Rules apply to entire rows in Raw Data view\n' +
        '- **field**: Rules apply to column in ONE specific widget only\n\n' +
        'Rules use Python formulas (e.g., $Price > 1000) and style options ' +
        '(fillColor, textColor, fontBold). Use action="list" first to see existing rules.\n\n' +
        '**NOTE:** This is the central tool for ALL visual formatting. When creating ' +
        'columns with rulesOptions in grist_manage_schema, those rules use this same ' +
        'formatting system internally.',
      examples: [
        {
          desc: 'Add column rule (applies to all views)',
          input: {
            docId: 'abc123',
            scope: 'column',
            tableId: 'Products',
            colId: 'Price',
            operation: {
              action: 'add',
              rule: {
                formula: '$Price > 1000',
                style: { fillColor: '#FF0000', textColor: '#FFFFFF', fontBold: true }
              }
            }
          }
        },
        {
          desc: 'Add row rule (format entire rows in Raw Data)',
          input: {
            docId: 'abc123',
            scope: 'row',
            tableId: 'Tasks',
            operation: {
              action: 'add',
              rule: {
                formula: '$Status == "Overdue"',
                style: { fillColor: '#FFCCCC' }
              }
            }
          }
        },
        {
          desc: 'Add field rule (specific widget only)',
          input: {
            docId: 'abc123',
            scope: 'field',
            tableId: 'Sales',
            colId: 'Amount',
            sectionId: 42,
            operation: {
              action: 'add',
              rule: {
                formula: '$Amount > 10000',
                style: { fillColor: '#90EE90' }
              }
            }
          }
        },
        {
          desc: 'List existing rules',
          input: {
            docId: 'abc123',
            scope: 'column',
            tableId: 'Products',
            colId: 'Price',
            operation: { action: 'list' }
          }
        }
      ],
      errors: [
        { error: 'Formula syntax error', solution: 'Use $ColumnName and Python operators' },
        { error: 'Invalid color format', solution: 'Use hex #RRGGBB (e.g., #FF0000)' },
        { error: 'Invalid ruleIndex', solution: 'Use action="list" to see valid indexes' },
        {
          error: 'Widget not found',
          solution: 'Use grist_get_pages to find widget sectionId or page/widget names'
        }
      ],
      parameters:
        '**Scopes:**\n' +
        '- column: Requires colId. Rules apply across all views.\n' +
        '- row: Only requires tableId. Rules apply to Raw Data view rows.\n' +
        '- field: Requires colId AND (sectionId OR pageName+widgetTitle). Rules apply to one widget.\n\n' +
        '**Formula syntax (Python):** $Price > 1000, $Status == "Active", $DueDate < NOW()\n' +
        '**Style options:** fillColor, textColor (#RRGGBB), fontBold, fontItalic, fontUnderline, fontStrikethrough\n\n' +
        'RELATED TOOLS:\n' +
        '- grist_manage_schema: Create columns with rulesOptions (uses this formatting system)\n' +
        '- grist_get_pages: Find widget sectionId for field-scope rules\n' +
        '- grist_manage_pages: Create widgets where field rules can be applied'
    }
  }
] as const
