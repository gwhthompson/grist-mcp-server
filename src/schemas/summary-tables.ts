import { z } from 'zod'
import { DocIdSchema, ResponseFormatSchema, TableIdSchema } from './common.js'

/**
 * Schema for grist_create_summary_table tool
 *
 * Summary tables aggregate data from a source table using group-by columns.
 * Grist automatically creates:
 * - A `count` column (using `len($group)`)
 * - SUM columns for numeric fields
 *
 * Other aggregations (AVERAGE, MIN, MAX, etc.) can be added as formula columns
 * after summary table creation using formulas like `AVERAGE($group.column)`.
 */
export const CreateSummaryTableSchema = z
  .object({
    docId: DocIdSchema,

    sourceTable: TableIdSchema.describe(
      'Source table to create summary from. Example: "Investments", "Sales", "Customers"'
    ),

    groupByColumns: z
      .array(z.string().min(1))
      .min(1)
      .max(10)
      .describe(
        'Columns to group by (1-10 columns). Example: ["category", "year"] creates summary grouped by category and year'
      ),

    keepPage: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Keep the auto-created page visible in Grist UI. ' +
          'Default: false (summary table in Raw Data only). ' +
          'Set true to create a visible page named "Summary: {table} by {columns}"'
      ),

    response_format: ResponseFormatSchema.optional().default('markdown')
  })
  .strict()

export type CreateSummaryTableInput = z.infer<typeof CreateSummaryTableSchema>
