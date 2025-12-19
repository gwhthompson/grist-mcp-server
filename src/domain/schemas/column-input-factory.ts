/**
 * Column Input Schema Factory
 *
 * Creates schema pipelines that:
 * 1. Validate user input
 * 2. Apply sync transforms via codecs (choices, currency)
 * 3. Apply async transforms (visibleCol resolution)
 *
 * The factory pattern binds the schema to a specific context (client, docId, tableId)
 * enabling async resolution during validation.
 *
 * @example
 * ```typescript
 * const schema = createResolvedColumnSchema(client, docId, tableId)
 *
 * // Parse and transform in one step
 * const resolved = await schema.parseAsync({
 *   colId: 'Company',
 *   type: 'Ref:Companies',
 *   visibleCol: 'Name',        // String → resolves to number
 *   choices: ['A', 'B']        // → ['L', 'A', 'B']
 * })
 *
 * // resolved.visibleCol is now a number
 * // resolved.widgetOptions.choices is now ['L', 'A', 'B']
 * ```
 */

import { z } from 'zod'
import { extractForeignTable, resolveVisibleCol } from '../../services/column-resolver.js'
import type { GristClient } from '../../services/grist-client.js'
import { type NaturalWidgetOptions, WidgetOptionsCodec } from '../codecs/widget-options.js'
import { AddColumnInputSchema, ModifyColumnInputSchema } from './table.js'

// =============================================================================
// Extended Input Schema (with natural widget option fields at top level)
// =============================================================================

/**
 * Extended column input schema that accepts widget option fields at top level.
 * This is the "natural" format users provide.
 *
 * Example:
 * {
 *   colId: 'Status',
 *   type: 'Choice',
 *   choices: ['Open', 'Closed'],     // Top-level, not in widgetOptions
 *   currency: 'usd'                   // Will be normalized to 'USD'
 * }
 */
const ExtendedColumnInputSchema = AddColumnInputSchema.extend({
  // Widget options can be at top level for convenience
  choices: z.array(z.string()).optional(),
  currency: z.string().min(3).max(3).optional(),
  decimals: z.number().int().min(0).max(10).optional(),
  numMode: z.enum(['currency', 'percent', 'decimal', 'scientific']).optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional()
})

export type ExtendedColumnInput = z.infer<typeof ExtendedColumnInputSchema>

/**
 * Extended modify column input schema.
 */
const ExtendedModifyColumnInputSchema = ModifyColumnInputSchema.extend({
  choices: z.array(z.string()).optional(),
  currency: z.string().min(3).max(3).optional(),
  decimals: z.number().int().min(0).max(10).optional(),
  numMode: z.enum(['currency', 'percent', 'decimal', 'scientific']).optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional()
})

export type ExtendedModifyColumnInput = z.infer<typeof ExtendedModifyColumnInputSchema>

// =============================================================================
// Resolved Output Type
// =============================================================================

/**
 * Resolved column input - after all transforms are applied.
 * visibleCol is always a number (or undefined).
 * widgetOptions contains Grist-format values (choices with L prefix, etc).
 */
export interface ResolvedColumnInput {
  colId: string
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: number
  widgetOptions?: Record<string, unknown>
}

/**
 * Resolved modify column input.
 */
export interface ResolvedModifyColumnInput {
  type?: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: number
  widgetOptions?: Record<string, unknown>
}

// =============================================================================
// Schema Factory Functions
// =============================================================================

/**
 * Creates a schema that resolves and transforms column input.
 *
 * Pipeline:
 * 1. Validate input against ExtendedColumnInputSchema
 * 2. Extract top-level widget options and merge into widgetOptions object
 * 3. Transform widgetOptions via codec (choices → ['L', ...], currency → uppercase)
 * 4. Resolve string visibleCol to numeric colRef (async)
 *
 * @param client - GristClient for API calls
 * @param docId - Document ID
 * @param tableId - Table ID (for context, though visibleCol resolves against foreign table)
 */
export function createResolvedColumnSchema(client: GristClient, docId: string, _tableId: string) {
  return (
    ExtendedColumnInputSchema
      // Step 1: Merge top-level widget options into widgetOptions object
      .transform((data) => {
        const { choices, currency, decimals, numMode, dateFormat, timeFormat, ...rest } = data

        // Build natural widget options from top-level fields + existing widgetOptions
        const naturalOptions: NaturalWidgetOptions = {
          ...data.widgetOptions,
          ...(choices && { choices }),
          ...(currency && { currency }),
          ...(decimals !== undefined && { decimals }),
          ...(numMode && { numMode }),
          ...(dateFormat && { dateFormat }),
          ...(timeFormat && { timeFormat })
        }

        // Only set widgetOptions if we have any options
        const hasOptions = Object.keys(naturalOptions).length > 0

        return {
          ...rest,
          widgetOptions: hasOptions ? naturalOptions : undefined
        }
      })
      // Step 2: Transform widgetOptions via codec
      .transform((data) => {
        if (!data.widgetOptions) {
          return data
        }

        // Apply codec: choices → ['L', ...], currency → uppercase
        const gristOptions = WidgetOptionsCodec.parse(data.widgetOptions)

        return {
          ...data,
          widgetOptions: gristOptions as Record<string, unknown>
        }
      })
      // Step 3: Resolve string visibleCol to numeric colRef (async)
      .transform(async (data): Promise<ResolvedColumnInput> => {
        let resolvedVisibleCol = data.visibleCol

        // Only resolve if visibleCol is a string and type is Ref/RefList
        if (typeof data.visibleCol === 'string' && data.type) {
          const foreignTable = extractForeignTable(data.type)
          if (foreignTable) {
            resolvedVisibleCol = await resolveVisibleCol(
              client,
              docId,
              foreignTable,
              data.visibleCol
            )
          }
        }

        return {
          colId: data.colId,
          type: data.type,
          label: data.label,
          isFormula: data.isFormula,
          formula: data.formula,
          visibleCol: resolvedVisibleCol as number | undefined,
          widgetOptions: data.widgetOptions
        }
      })
  )
}

/**
 * Creates a schema that resolves and transforms modify column input.
 *
 * Same pipeline as createResolvedColumnSchema but for partial updates.
 */
export function createResolvedModifyColumnSchema(
  client: GristClient,
  docId: string,
  _tableId: string
) {
  return (
    ExtendedModifyColumnInputSchema
      // Step 1: Merge top-level widget options
      .transform((data) => {
        const { choices, currency, decimals, numMode, dateFormat, timeFormat, ...rest } = data

        const naturalOptions: NaturalWidgetOptions = {
          ...data.widgetOptions,
          ...(choices && { choices }),
          ...(currency && { currency }),
          ...(decimals !== undefined && { decimals }),
          ...(numMode && { numMode }),
          ...(dateFormat && { dateFormat }),
          ...(timeFormat && { timeFormat })
        }

        const hasOptions = Object.keys(naturalOptions).length > 0

        return {
          ...rest,
          widgetOptions: hasOptions ? naturalOptions : undefined
        }
      })
      // Step 2: Transform widgetOptions via codec
      .transform((data) => {
        if (!data.widgetOptions) {
          return data
        }

        const gristOptions = WidgetOptionsCodec.parse(data.widgetOptions)

        return {
          ...data,
          widgetOptions: gristOptions as Record<string, unknown>
        }
      })
      // Step 3: Resolve string visibleCol (async)
      .transform(async (data): Promise<ResolvedModifyColumnInput> => {
        let resolvedVisibleCol = data.visibleCol

        if (typeof data.visibleCol === 'string' && data.type) {
          const foreignTable = extractForeignTable(data.type)
          if (foreignTable) {
            resolvedVisibleCol = await resolveVisibleCol(
              client,
              docId,
              foreignTable,
              data.visibleCol
            )
          }
        }

        return {
          type: data.type,
          label: data.label,
          isFormula: data.isFormula,
          formula: data.formula,
          visibleCol: resolvedVisibleCol as number | undefined,
          widgetOptions: data.widgetOptions
        }
      })
  )
}

// =============================================================================
// Type Exports for Schema Output
// =============================================================================

/**
 * Type of the resolved column schema.
 * Use this to type the schema returned by createResolvedColumnSchema.
 */
export type ResolvedColumnSchema = ReturnType<typeof createResolvedColumnSchema>

/**
 * Type of the resolved modify column schema.
 */
export type ResolvedModifyColumnSchema = ReturnType<typeof createResolvedModifyColumnSchema>
