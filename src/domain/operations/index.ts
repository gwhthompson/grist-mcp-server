/**
 * Domain Operations Index
 *
 * Exports domain operations and shared utilities.
 */

export type { ColumnTypeMap } from './base.js'
// Base utilities
export {
  buildColumnTypeMap,
  deepEqual,
  normalizeValue,
  throwIfFailed,
  verifyDeleted,
  verifyEntities
} from './base.js'
export type {
  ConfigureWidgetInput,
  ConfigureWidgetResult,
  CreatePageResult,
  CreatePageWithLayoutInput,
  DeletePageResult,
  DomainPage,
  DomainWidget,
  GetLayoutResult,
  LayoutWidgetInfo,
  LinkWidgetInput,
  LinkWidgetResult,
  RemoveWidgetResult,
  RenamePageResult,
  ReorderPagesResult,
  SetLayoutResult
} from './pages.js'
// Page and widget operations
export {
  configureWidget,
  createPage,
  deletePage,
  getLayout,
  getPage,
  getPages,
  getWidget,
  getWidgets,
  linkWidget,
  removeWidget,
  renamePage,
  reorderPages,
  setLayout
} from './pages.js'
export type {
  AddRecordsResult,
  DeleteRecordsResult,
  DomainRecord,
  UpdateRecordsResult
} from './records.js'
// Record operations
export {
  addRecords,
  deleteRecords,
  getRecord,
  getRecords,
  updateRecords,
  verifyRecords
} from './records.js'
export type {
  AddColumnInput,
  AddColumnResult,
  CreateTableInput,
  CreateTableResult,
  DeleteTableResult,
  DomainColumn,
  DomainTable,
  ModifyColumnInput,
  ModifyColumnResult,
  RemoveColumnResult,
  RenameColumnResult,
  RenameTableResult
} from './schema.js'
// Schema operations (columns and tables)
export {
  addColumn,
  createTable,
  deleteTable,
  getColumn,
  getColumns,
  getTable,
  getTables,
  modifyColumn,
  removeColumn,
  renameColumn,
  renameTable
} from './schema.js'
