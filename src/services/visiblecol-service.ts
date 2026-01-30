/**
 * VisibleColService - Consolidated handling for Ref/RefList column display settings
 *
 * This service consolidates the workaround for Grist Core issue #970:
 * visibleCol must be set via UpdateRecord in _grist_Tables_column metadata,
 * plus SetDisplayFormula to show the referenced column's value.
 *
 * Previously duplicated in:
 * - src/tools/tables.ts (createTable)
 * - src/tools/columns.ts (manageColumns)
 */

import { ApplyResponseSchema } from '../schemas/api-responses.js'
import type { TableId } from '../types/advanced.js'
import type { ApplyResponse } from '../types.js'
import { validateRetValues } from '../validators/apply-response.js'
import { buildSetDisplayFormulaAction, buildUpdateColumnMetadataAction } from './action-builder.js'
import { serializeUserAction } from './action-serializer.js'
import { extractForeignTable, getColumnNameFromId } from './column-resolver.js'
import type { GristClient } from './grist-client.js'

/**
 * Parameters for setting up visibleCol on a reference column.
 * All numeric IDs should be pre-resolved before calling.
 */
export interface VisibleColSetupParams {
  readonly docId: string
  readonly tableId: string
  readonly colId: string
  readonly colRef: number
  readonly visibleCol: number // Already resolved to numeric column ID
  readonly columnType: string // e.g., "Ref:People" or "RefList:Tags"
}

/**
 * Result of setting up visibleCol for a column.
 */
export interface VisibleColSetupResult {
  readonly success: boolean
  readonly colId: string
  readonly visibleColSet: boolean
  readonly displayFormulaSet: boolean
  readonly error?: string
}

/**
 * Service for setting up visibleCol on Ref/RefList columns.
 *
 * Handles the two-step process required by Grist:
 * 1. UpdateRecord on _grist_Tables_column to set visibleCol
 * 2. SetDisplayFormula to show the referenced column value
 */
export class VisibleColService {
  constructor(private readonly client: GristClient) {}

  /**
   * Set up visibleCol for a single column.
   *
   * @param params - Column setup parameters
   * @returns Setup result indicating success/failure of each step
   */
  async setup(params: VisibleColSetupParams): Promise<VisibleColSetupResult> {
    const { docId, tableId, colId, colRef, visibleCol, columnType } = params

    let visibleColSet = false
    let displayFormulaSet = false

    try {
      // Step 1: UpdateRecord to set visibleCol in _grist_Tables_column metadata
      const updateAction = buildUpdateColumnMetadataAction(colRef, { visibleCol })

      const updateResponse = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [serializeUserAction(updateAction)],
        {
          schema: ApplyResponseSchema,
          context: `Setting visibleCol for column ${colId}`
        }
      )

      validateRetValues(updateResponse, {
        context: `Setting visibleCol for column ${colId}`
      })

      visibleColSet = true

      // Step 2: SetDisplayFormula to show the referenced column value
      const foreignTable = extractForeignTable(columnType)
      if (!foreignTable) {
        return {
          success: false,
          colId,
          visibleColSet,
          displayFormulaSet,
          error: `Could not extract foreign table from type "${columnType}"`
        }
      }

      // Resolve numeric visibleCol ID to column name for the formula
      const foreignColName = await getColumnNameFromId(this.client, docId, foreignTable, visibleCol)

      // Build formula like $ColId.ForeignColName
      const formula = `$${colId}.${foreignColName}`

      const setDisplayAction = buildSetDisplayFormulaAction(
        tableId as TableId,
        null, // colId parameter - null means use fieldRef
        colRef, // fieldRef - the column reference
        formula
      )

      const displayResponse = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [serializeUserAction(setDisplayAction)],
        {
          schema: ApplyResponseSchema,
          context: `Setting display formula for column ${colId}`
        }
      )

      validateRetValues(displayResponse, {
        context: `Setting display formula for column ${colId}`
      })

      displayFormulaSet = true

      return {
        success: true,
        colId,
        visibleColSet,
        displayFormulaSet
      }
    } catch (error) {
      return {
        success: false,
        colId,
        visibleColSet,
        displayFormulaSet,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Set up visibleCol for multiple columns.
   * Processes columns in parallel for efficiency.
   *
   * @param columns - Array of column setup parameters
   * @returns Array of setup results, one per column
   */
  async setupBatch(columns: VisibleColSetupParams[]): Promise<VisibleColSetupResult[]> {
    return await Promise.all(columns.map((col) => this.setup(col)))
  }

  /**
   * Aggregate results from batch setup into a summary.
   *
   * @param results - Array of setup results
   * @returns Summary with success/failure counts
   */
  static summarizeResults(results: VisibleColSetupResult[]): {
    totalColumns: number
    successful: number
    failed: number
    errors: Array<{ colId: string; error: string }>
  } {
    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length
    const errors = results
      .filter((r) => !r.success && r.error)
      .map((r) => ({ colId: r.colId, error: r.error as string }))

    return {
      totalColumns: results.length,
      successful,
      failed,
      errors
    }
  }
}
