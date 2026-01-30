/**
 * User action serialization.
 *
 * Converts type-safe UserActionObject to the tuple format expected by Grist API.
 * Pure functions with no dependency on the GristClient class.
 */

import type { UserActionObject, UserActionTuple } from '../types.js'

/**
 * Serializes a type-safe UserActionObject to the tuple format expected by Grist API.
 * This provides a clean boundary between type-safe action building and API wire format.
 *
 * @example
 * // Build action with full type safety
 * const action: BulkAddRecordAction = {
 *   action: 'BulkAddRecord',
 *   tableId: 'Contacts',
 *   rowIds: [null],
 *   columns: { Name: ['John'] }
 * }
 * // Serialize for API call
 * const tuple = serializeUserAction(action)
 * // tuple = ['BulkAddRecord', 'Contacts', [null], { Name: ['John'] }]
 */
export function serializeUserAction(action: UserActionObject): UserActionTuple {
  switch (action.action) {
    // Record operations
    case 'BulkAddRecord':
      return ['BulkAddRecord', action.tableId, action.rowIds, action.columns]
    case 'BulkUpdateRecord':
      return ['BulkUpdateRecord', action.tableId, action.rowIds, action.columns]
    case 'BulkRemoveRecord':
      return ['BulkRemoveRecord', action.tableId, action.rowIds]
    case 'UpdateRecord':
      return ['UpdateRecord', action.tableId, action.rowId, action.fields]
    case 'AddRecord':
      return ['AddRecord', action.tableId, action.rowId, action.fields]

    // Table operations
    case 'AddTable':
      return ['AddTable', action.tableName, action.columns]
    case 'RenameTable':
      return ['RenameTable', action.tableId, action.newTableId]
    case 'RemoveTable':
      return ['RemoveTable', action.tableId]

    // Column operations
    case 'AddColumn':
      return ['AddColumn', action.tableId, action.colId, action.colInfo]
    case 'AddHiddenColumn':
      return ['AddHiddenColumn', action.tableId, action.colId, action.colInfo]
    case 'ModifyColumn':
      return ['ModifyColumn', action.tableId, action.colId, action.updates]
    case 'RemoveColumn':
      return ['RemoveColumn', action.tableId, action.colId]
    case 'RenameColumn':
      return ['RenameColumn', action.tableId, action.oldColId, action.newColId]

    // Display formula operations
    case 'SetDisplayFormula':
      return ['SetDisplayFormula', action.tableId, action.colId, action.fieldRef, action.formula]

    // Conditional formatting operations
    case 'AddEmptyRule':
      return ['AddEmptyRule', action.tableId, action.fieldRef, action.colRef]

    // Page/Widget operations
    case 'CreateViewSection':
      return [
        'CreateViewSection',
        action.tableRef,
        action.viewRef,
        action.widgetType,
        action.visibleCols,
        action.title
      ]

    // Metadata table updates - serializes to 'UpdateRecord' for Grist API
    case 'UpdateMetadata':
      return ['UpdateRecord', action.metaTableId, action.rowId, action.updates]

    default: {
      // Exhaustiveness check - TypeScript will error if a case is missing
      const _exhaustive: never = action
      throw new Error(`Unknown action type: ${(_exhaustive as UserActionObject).action}`)
    }
  }
}

/**
 * Serializes multiple UserActionObjects to tuple format for batch API calls.
 */
export function serializeUserActions(actions: UserActionObject[]): UserActionTuple[] {
  return actions.map(serializeUserAction)
}
