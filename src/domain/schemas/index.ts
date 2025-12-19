/**
 * Domain Schemas Index
 *
 * Exports all domain entity schemas with their registry metadata.
 */

// Schema factories for async resolution
export {
  createResolvedColumnSchema,
  createResolvedModifyColumnSchema,
  type ExtendedColumnInput,
  type ExtendedModifyColumnInput,
  type ResolvedColumnInput,
  type ResolvedColumnSchema,
  type ResolvedModifyColumnInput,
  type ResolvedModifyColumnSchema
} from './column-input-factory.js'
export {
  type ConfigureWidgetInput,
  ConfigureWidgetInputSchema,
  type ConfigureWidgetResult,
  type CreatePageInput,
  CreatePageInputSchema,
  type CreatePageResult,
  type CreatePageWithLayoutInput,
  type DeletePageResult,
  type DomainPage,
  // Page schemas
  DomainPageSchema,
  // Types
  type DomainWidget,
  DomainWidgetSchema,
  type GetLayoutResult,
  // Layout operation types
  type LayoutWidgetInfo,
  type LinkWidgetInput,
  LinkWidgetInputSchema,
  type LinkWidgetResult,
  type RemoveWidgetResult,
  type RenamePageResult,
  type ReorderPagesResult,
  type SetLayoutResult,
  // Widget schemas
  WidgetTypeSchema
} from './page.js'
export {
  type AddRecordInput,
  AddRecordInputSchema,
  type AddRecordsResult,
  type BatchUpdateInput,
  BatchUpdateInputSchema,
  // Types
  type CellValue,
  // Record schemas
  CellValueSchema,
  type DeleteRecordsInput,
  DeleteRecordsInputSchema,
  type DeleteRecordsResult,
  type DomainRecord,
  DomainRecordSchema,
  type UpdateRecordInput,
  UpdateRecordInputSchema,
  type UpdateRecordsResult
} from './record.js'
export {
  type AddColumnInput,
  AddColumnInputSchema,
  type AddColumnResult,
  type CreateTableInput,
  CreateTableInputSchema,
  type CreateTableResult,
  type DeleteTableResult,
  // Types
  type DomainColumn,
  DomainColumnSchema,
  type DomainTable,
  // Table schemas
  DomainTableSchema,
  type ModifyColumnInput,
  ModifyColumnInputSchema,
  type ModifyColumnResult,
  type RemoveColumnResult,
  type RenameColumnResult,
  type RenameTableResult,
  // Column schemas
  WidgetOptionsSchema
} from './table.js'
