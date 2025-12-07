import { z } from 'zod'
import { ColIdSchema, DocIdSchema, ResponseFormatSchema, TableIdSchema } from './common.js'
import { StylePropertiesSchema } from './widget-options.js'

// ============================================================================
// Formula and Style Schemas (shared across all scopes)
// ============================================================================

export const RuleFormulaSchema = z
  .string()
  .min(1, 'Formula cannot be empty')
  .max(1000, 'Formula exceeds maximum length (1000 characters). Break into simpler conditions.')
  .refine((val) => val.trim().length > 0, {
    message: 'Formula must contain non-whitespace characters'
  })
  .describe(
    'Python formula returning boolean. Examples: "$Price > 1000", "$Status == \\"Active\\"", "$DueDate < NOW()"'
  )

export type RuleFormula = z.infer<typeof RuleFormulaSchema>

export const ConditionalFormatOptionsSchema = StylePropertiesSchema

export type ConditionalFormatOptions = z.infer<typeof ConditionalFormatOptionsSchema>

export const BaseConditionalRuleSchema = z
  .object({
    formula: RuleFormulaSchema,
    style: ConditionalFormatOptionsSchema
  })
  .strict()

export type BaseConditionalRule = z.infer<typeof BaseConditionalRuleSchema>

// ============================================================================
// Rule Operation Schema (shared across all scopes)
// ============================================================================

export const RuleOperationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('add'),
      rule: BaseConditionalRuleSchema.describe(
        'Conditional rule to add. Will be appended to end of rules array (lowest priority).'
      )
    })
    .strict(),

  z
    .object({
      action: z.literal('update'),
      ruleIndex: z
        .number()
        .int()
        .min(0)
        .describe('Zero-based index of rule to update. Get current index from list operation.'),
      rule: BaseConditionalRuleSchema.describe('Updated rule definition (replaces existing rule).')
    })
    .strict(),

  z
    .object({
      action: z.literal('remove'),
      ruleIndex: z
        .number()
        .int()
        .min(0)
        .describe('Zero-based index of rule to remove. Get current index from list operation.')
    })
    .strict(),

  z
    .object({
      action: z.literal('list')
    })
    .strict()
])

export type RuleOperation = z.infer<typeof RuleOperationSchema>

// ============================================================================
// Scope-specific Input Schemas
// ============================================================================

/**
 * Row scope - format entire rows based on conditions.
 * Rules apply to the table's Raw Data view section (rawViewSectionRef).
 * No widget ID needed - rules are looked up via tableId.
 */
const RowScopeSchema = z
  .object({
    docId: DocIdSchema,
    scope: z.literal('row'),
    tableId: TableIdSchema.describe('Table whose rows to format. Rules apply to Raw Data view.'),
    operation: RuleOperationSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

/**
 * Column scope - format column cells across all views.
 * Rules apply to the column definition in _grist_Tables_column.
 */
const ColumnScopeSchema = z
  .object({
    docId: DocIdSchema,
    scope: z.literal('column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    operation: RuleOperationSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

/**
 * Field scope - format column in one specific widget only.
 * Rules apply to the field definition in _grist_Views_section_field.
 *
 * Note: Uses superRefine for widget identification validation since
 * discriminatedUnion doesn't support ZodEffects from .refine().
 */
const FieldScopeBaseSchema = z
  .object({
    docId: DocIdSchema,
    scope: z.literal('field'),
    tableId: TableIdSchema,
    colId: ColIdSchema.describe('Column to format within the specified widget.'),
    // Widget identification: either sectionId OR page+widget names
    sectionId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Widget section ID from grist_get_pages or grist_build_page response.'),
    pageName: z
      .string()
      .min(1)
      .optional()
      .describe('Page name containing the widget. Case-sensitive.'),
    widgetTitle: z.string().min(1).optional().describe('Widget title on the page. Case-sensitive.'),
    operation: RuleOperationSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

// ============================================================================
// Main Input Schema (discriminated union on scope)
// ============================================================================

// Single flat object schema with superRefine for scope-specific validation
// Note: MCP requires inputSchema to have type:"object" at root - unions produce "anyOf" which breaks tool registration
export const ConditionalRulesInputSchema = z
  .object({
    docId: DocIdSchema,
    scope: z.enum(['row', 'column', 'field']).describe('Scope of conditional formatting rules'),
    tableId: TableIdSchema,
    colId: ColIdSchema.optional().describe('Required for column and field scopes'),
    sectionId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Widget section ID (for field scope). Alternative to pageName+widgetTitle.'),
    pageName: z
      .string()
      .min(1)
      .optional()
      .describe('Page name (for field scope). Use with widgetTitle.'),
    widgetTitle: z
      .string()
      .min(1)
      .optional()
      .describe('Widget title (for field scope). Use with pageName.'),
    operation: RuleOperationSchema,
    response_format: ResponseFormatSchema
  })
  .strict()
  .superRefine((data, ctx) => {
    // column and field scopes require colId
    if ((data.scope === 'column' || data.scope === 'field') && !data.colId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `colId is required for ${data.scope} scope`,
        path: ['colId']
      })
    }
    // field scope requires widget identification
    if (data.scope === 'field') {
      const hasSection = data.sectionId !== undefined
      const hasPageWidget = data.pageName !== undefined && data.widgetTitle !== undefined
      if (!hasSection && !hasPageWidget) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Field scope requires sectionId OR both pageName and widgetTitle',
          path: ['sectionId']
        })
      }
    }
  })

export type ConditionalRulesInput = z.infer<typeof ConditionalRulesInputSchema>

// Type guards for scope discrimination
export type RowScopeInput = z.infer<typeof RowScopeSchema>
export type ColumnScopeInput = z.infer<typeof ColumnScopeSchema>
export type FieldScopeInput = z.infer<typeof FieldScopeBaseSchema>

export function isRowScope(input: ConditionalRulesInput): input is RowScopeInput {
  return input.scope === 'row'
}

export function isColumnScope(input: ConditionalRulesInput): input is ColumnScopeInput {
  return input.scope === 'column'
}

export function isFieldScope(input: ConditionalRulesInput): input is FieldScopeInput {
  return input.scope === 'field'
}

// ============================================================================
// Display and Internal Types
// ============================================================================

// colRef points to gristHelper_ConditionalRule_N or gristHelper_RowConditionalRule_N column
export interface GristConditionalRuleRaw {
  colRef: number
  style: Record<string, unknown>
}

export interface ConditionalRuleDisplay {
  index: number
  formula: string
  style: ConditionalFormatOptions
}

// ============================================================================
// Legacy Exports (for backward compatibility during migration)
// ============================================================================

// These will be removed after refactoring is complete
export const ColumnRuleOperationSchema = RuleOperationSchema
export type ColumnRuleOperation = RuleOperation

export const ColumnConditionalRulesInputSchema = ColumnScopeSchema
export type ColumnConditionalRulesInput = ColumnScopeInput
