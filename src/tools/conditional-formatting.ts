/**
 * Unified Conditional Formatting Tool
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

export class ConditionalFormattingTool extends GristTool<
  typeof ConditionalRulesInputSchema,
  RuleOperationResult | RuleRemoveResult
> {
  constructor(context: ToolContext) {
    super(context, ConditionalRulesInputSchema)
  }

  protected async executeInternal(
    params: ToolInput
  ): Promise<RuleOperationResult | RuleRemoveResult> {
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)

    // Determine scope and build owner params
    const scope = this.getScope(params)
    const ownerParams = await this.buildOwnerParams(params, docId)

    // Create service for this scope
    const service = new ConditionalFormattingService(this.client, scope)

    // Execute operation
    switch (params.operation.action) {
      case 'add':
        return await service.addRule(docId, tableId, ownerParams, params.operation.rule)

      case 'update':
        return await service.updateRule(
          docId,
          tableId,
          ownerParams,
          params.operation.ruleIndex,
          params.operation.rule
        )

      case 'remove':
        return await service.removeRule(docId, tableId, ownerParams, params.operation.ruleIndex)

      case 'list':
        return await service.listRules(docId, tableId, ownerParams)

      default: {
        const _exhaustive: never = params.operation
        throw new Error(`Unknown operation: ${JSON.stringify(_exhaustive)}`)
      }
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

  protected override formatResponse(
    result: RuleOperationResult | RuleRemoveResult,
    format: 'markdown' | 'json'
  ): MCPToolResponse {
    // Remove result (string message)
    if ('message' in result && 'remainingRules' in result) {
      const removeResult = result as RuleRemoveResult
      if (format === 'json') {
        return {
          content: [{ type: 'text', text: JSON.stringify(removeResult, null, 2) }],
          _meta: { responseFormat: format }
        }
      }
      return {
        content: [{ type: 'text', text: removeResult.message }],
        _meta: { responseFormat: format }
      }
    }

    // Rules result
    const rulesResult = result as RuleOperationResult

    if (format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(rulesResult, null, 2) }],
        _meta: { responseFormat: format }
      }
    }

    // Markdown format
    const markdown = this.formatRulesMarkdown(rulesResult)
    return {
      content: [{ type: 'text', text: markdown }],
      _meta: { responseFormat: format }
    }
  }

  /**
   * Format rules result as markdown
   */
  private formatRulesMarkdown(result: RuleOperationResult): string {
    const lines: string[] = []

    // Header with scope and target info
    const scopeDesc = this.getScopeDescription(result.scope, result.target)
    lines.push(`## Conditional Rules for ${scopeDesc}`)
    lines.push('')

    if (result.rules.length === 0) {
      lines.push('No conditional formatting rules defined.')
      lines.push('')
      lines.push('Use `action: "add"` to create a rule.')
      return lines.join('\n')
    }

    lines.push(`**Total Rules:** ${result.totalRules}`)
    lines.push('')

    for (const rule of result.rules) {
      lines.push(`### Rule ${rule.index}`)
      lines.push(`**Formula:** \`${rule.formula}\``)

      // Format style
      const styleEntries = Object.entries(rule.style).filter(([_, v]) => v !== undefined)
      if (styleEntries.length > 0) {
        lines.push('**Style:**')
        for (const [key, value] of styleEntries) {
          lines.push(`  - ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Get human-readable scope description
   */
  private getScopeDescription(scope: RuleScope, target: RuleOperationResult['target']): string {
    switch (scope) {
      case 'column':
        return `column "${target.colId}" in ${target.tableId}`
      case 'row':
        return `rows in ${target.tableId}${target.sectionId ? ` (widget ${target.sectionId})` : ''}`
      case 'field':
        return `field "${target.colId}" in widget ${target.sectionId} (${target.tableId})`
      default:
        return target.tableId
    }
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
    description:
      'Add, update, remove, or list conditional formatting rules.\n' +
      'Scopes: column (all views), row (entire rows), field (specific widget).\n' +
      'Formulas: Python syntax with $ColumnName. Colors: hex #RRGGBB.\n' +
      'Ex: {scope:"column",colId:"Price",operation:{action:"add",rule:{formula:"$Price>1000",style:{fillColor:"#FF0000"}}}}\n' +
      '->grist_help',
    purpose: 'Add visual formatting rules that highlight cells based on conditions',
    category: 'columns',
    inputSchema: ConditionalRulesInputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageConditionalRules,
    docs: {
      overview:
        'Manage conditional formatting rules across three scopes:\n' +
        '- **column**: Rules apply to column cells across ALL views\n' +
        '- **row**: Rules apply to entire rows in Raw Data view\n' +
        '- **field**: Rules apply to column in ONE specific widget only\n\n' +
        'Rules use Python formulas (e.g., $Price > 1000) and style options ' +
        '(fillColor, textColor, fontBold). Use action="list" first to see existing rules.',
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
        '**Style options:** fillColor, textColor (#RRGGBB), fontBold, fontItalic, fontUnderline, fontStrikethrough'
    }
  }
] as const
