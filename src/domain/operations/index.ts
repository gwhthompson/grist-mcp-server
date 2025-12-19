/**
 * Domain Operations Index
 *
 * Exports all domain operations and shared utilities.
 */

// Base utilities
export {
  createNormalizer,
  deepEqual,
  normalizeValue,
  throwIfFailed,
  verifyDeleted,
  verifyEntities
} from './base.js'
// Page and widget operations
export {
  configureWidget,
  // Layout operations
  createPage,
  deletePage,
  getLayout,
  getPage,
  // Page operations
  getPages,
  getWidget,
  // Widget operations
  getWidgets,
  linkWidget,
  removeWidget,
  renamePage,
  reorderPages,
  setLayout
} from './pages.js'

// Record operations
export {
  addRecords,
  deleteRecords,
  getRecord,
  getRecords,
  updateRecords,
  verifyRecords
} from './records.js'

// Schema operations (columns and tables)
export {
  addColumn,
  createTable,
  deleteTable,
  getColumn,
  // Column operations
  getColumns,
  getTable,
  // Table operations
  getTables,
  modifyColumn,
  removeColumn,
  renameColumn,
  renameTable
} from './schema.js'
// Types
export type {
  AddInput,
  ColumnLocator,
  ColumnTypeMap,
  EntityFilter,
  EntityId,
  EntityOperations,
  PageLocator,
  RecordLocator,
  TableLocator,
  UpdateInput,
  ValueNormalizer,
  VerifiedBatchDeleteResult,
  VerifiedBatchResult,
  VerifiedDeleteResult,
  VerifiedResult,
  WidgetLocator,
  WriteOptions
} from './types.js'
