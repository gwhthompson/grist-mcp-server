/**
 * Consolidated style schemas.
 *
 * Single source of truth for styling properties used across:
 * - Column definitions (column-types.ts)
 * - Widget options (widget-options.ts)
 * - Conditional formatting rules (conditional-rules.ts)
 */

import { z } from 'zod'
import { AlignmentSchema, HexColorSchema } from './common.js'

// =============================================================================
// Base Style Properties (shared across all style schemas)
// =============================================================================

/**
 * Cell text and fill styling properties.
 * Used by: column styles, rule styles, widget options.
 * Uses strictObject to reject unknown properties.
 */
const CellStyleBaseSchema = z.strictObject({
  textColor: HexColorSchema,
  fillColor: HexColorSchema,
  fontBold: z.boolean(),
  fontItalic: z.boolean(),
  fontUnderline: z.boolean(),
  fontStrikethrough: z.boolean()
})

/**
 * Header-specific styling properties.
 * Only applicable to column headers, not rules.
 * Exported for use in widget-options.ts.
 * Uses strictObject to reject unknown properties.
 */
export const HeaderStyleBaseSchema = z.strictObject({
  headerTextColor: HexColorSchema,
  headerFillColor: HexColorSchema,
  headerFontBold: z.boolean(),
  headerFontItalic: z.boolean(),
  headerFontUnderline: z.boolean(),
  headerFontStrikethrough: z.boolean()
})

// =============================================================================
// Exported Style Schemas
// =============================================================================

/**
 * Conditional formatting rule style.
 * Subset of cell styling (no header properties).
 */
export const RuleStyleSchema = CellStyleBaseSchema.partial().describe(
  'Conditional formatting style (textColor, fillColor, fontBold, etc.)'
)
export type RuleStyle = z.infer<typeof RuleStyleSchema>

/**
 * Column styling including headers and alignment.
 * Full styling options for column definitions.
 */
export const ColumnStyleSchema = CellStyleBaseSchema.merge(HeaderStyleBaseSchema)
  .extend({ alignment: AlignmentSchema })
  .partial()
  .describe('Column styling (cell + header properties)')
export type ColumnStyle = z.infer<typeof ColumnStyleSchema>

/**
 * Widget options style properties.
 * Used within widgetOptions for text/choice columns.
 */
export const WidgetStyleSchema = CellStyleBaseSchema.partial()
export type WidgetStyle = z.infer<typeof WidgetStyleSchema>

/**
 * Header styling schema (partial).
 * Used by widget options that need header styling.
 */
export const HeaderStyleSchema = HeaderStyleBaseSchema.partial()
export type HeaderStyle = z.infer<typeof HeaderStyleSchema>

// Note: Registration happens in registry.ts to avoid duplicates
// column-types.ts extends ColumnStyleSchema with rulesOptions, so that version gets registered
