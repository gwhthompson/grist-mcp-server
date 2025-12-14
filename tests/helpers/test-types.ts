/**
 * Type definitions for test data structures
 *
 * IMPORTANT: These are PLAIN types (no branded IDs) because they represent
 * unvalidated external API responses in tests.
 *
 * Design Philosophy:
 * - Tests represent the user's view: plain JavaScript values in/out
 * - Production code uses branded types for safety (DocId, TableId, etc.)
 * - This separation makes tests easier to understand and maintain
 *
 * @see src/types.ts - Production types with branded IDs
 * @see src/types/advanced.ts - Branded ID type definitions
 */

import type { CellValue } from '../../src/schemas/api-responses.js'

/**
 * Raw API record from Grist (no MCP processing)
 *
 * Represents data directly from Grist's REST API before any
 * encoding/decoding or validation occurs.
 *
 * @example
 * ```typescript
 * const response = await client.get<RawApiRecordsResponse>(
 *   `/docs/${docId}/tables/People/records`
 * )
 * response.records.forEach(record => {
 *   console.log(record.fields.Name)  // unknown type - not validated
 * })
 * ```
 */
export interface RawApiRecord {
  id: number
  fields: Record<string, unknown>
  errors?: Record<string, string>
}

/**
 * Response from Grist's raw records API
 *
 * @example
 * ```typescript
 * const people = await client.get<RawApiRecordsResponse>(
 *   `/docs/${docId}/tables/People/records`
 * )
 * const ids = people.records.map(r => r.id)
 * ```
 */
export interface RawApiRecordsResponse {
  records: RawApiRecord[]
}

/**
 * Processed test record (after CellValue schema validation)
 *
 * Represents data after MCP server has validated and encoded cell values.
 * Fields are flattened directly on the record object.
 * Values use CellValue type which includes Grist's special encodings
 * like ['d', timestamp] for dates.
 *
 * @example
 * ```typescript
 * const result = await getRecords(client, {
 *   docId,
 *   tableId: 'Events',
 *   response_format: 'json'
 * })
 * const response = result.structuredContent as TestGetRecordsResponse
 * response.items.forEach(record => {
 *   // Access fields directly: record.Name, record.Email, etc.
 * })
 * ```
 */
export interface TestRecord {
  id: number
  [fieldName: string]: CellValue | number | Record<string, string> | undefined
  errors?: Record<string, string>
}

/**
 * MCP tool response for grist_get_records
 *
 * @example
 * ```typescript
 * const result = await getRecords(client, {
 *   docId,
 *   tableId: 'Contacts',
 *   filters: { Status: 'Active' },
 *   response_format: 'json'
 * })
 * const data = result.structuredContent as TestGetRecordsResponse
 * expect(data.success).toBe(true)
 * expect(data.items).toHaveLength(3)
 * ```
 */
export interface TestGetRecordsResponse {
  success: boolean
  items: TestRecord[]
  pagination: {
    total: number
    offset: number
    limit: number
    hasMore: boolean
    nextOffset: number | null
  }
}

/**
 * MCP tool response for grist_add_records
 *
 * @example
 * ```typescript
 * const result = await addRecords(client, {
 *   docId,
 *   tableId: 'Users',
 *   records: [{ Name: 'Alice', Email: 'alice@example.com' }],
 *   response_format: 'json'
 * })
 * const data = result.structuredContent as TestAddRecordsResponse
 * expect(data.recordsAdded).toBe(1)
 * expect(data.row_ids).toHaveLength(1)
 * ```
 */
export interface TestAddRecordsResponse {
  success: boolean
  recordsAdded: number
  rowIds: number[]
}

/**
 * MCP tool response for grist_upsert_records
 *
 * @example
 * ```typescript
 * const result = await upsertRecords(client, {
 *   docId,
 *   tableId: 'Contacts',
 *   records: [{
 *     require: { Email: 'alice@example.com' },
 *     fields: { Name: 'Alice Updated' }
 *   }],
 *   response_format: 'json'
 * })
 * const data = result.structuredContent as TestUpsertRecordsResponse
 * expect(data.recordsUpdated).toBe(1)
 * ```
 */
export interface TestUpsertRecordsResponse {
  success: boolean
  recordsAdded: number
  recordsUpdated: number
  rowIds: number[]
}

/**
 * MCP tool response for grist_update_records
 *
 * @example
 * ```typescript
 * const result = await updateRecords(client, {
 *   docId,
 *   tableId: 'Tasks',
 *   rowIds: [1, 2, 3],
 *   updates: { Status: 'Complete' },
 *   response_format: 'json'
 * })
 * const data = result.structuredContent as TestUpdateRecordsResponse
 * expect(data.recordsUpdated).toBe(3)
 * ```
 */
export interface TestUpdateRecordsResponse {
  success: boolean
  recordsUpdated: number
}

/**
 * MCP tool response for grist_delete_records
 *
 * @example
 * ```typescript
 * const result = await deleteRecords(client, {
 *   docId,
 *   tableId: 'OldData',
 *   rowIds: [1, 2, 3],
 *   response_format: 'json'
 * })
 * const data = result.structuredContent as TestDeleteRecordsResponse
 * expect(data.recordsDeleted).toBe(3)
 * ```
 */
export interface TestDeleteRecordsResponse {
  success: boolean
  recordsDeleted: number
}

/**
 * Grist API column metadata (used for direct API calls in tests)
 *
 * Represents column structure returned by Grist's /docs/{docId}/tables/{tableId}/columns endpoint.
 * This is the raw API response before any MCP processing.
 *
 * @example
 * ```typescript
 * const response = await client.get<GristColumnsResponse>(
 *   `/docs/${docId}/tables/Users/columns`
 * )
 * const emailCol = response.columns.find(c => c.id === 'Email')
 * const widgetOpts = emailCol?.fields.widgetOptions
 * ```
 */
export interface GristColumnMetadata {
  id: string
  fields: {
    widgetOptions?: string
    type?: string
    label?: string
    isFormula?: boolean
    formula?: string
    visibleCol?: number
    colRef?: number
    displayCol?: number
    colId?: string
    [key: string]: unknown
  }
}

/**
 * Grist API columns list response
 */
export interface GristColumnsResponse {
  columns: GristColumnMetadata[]
}

/**
 * Grist API record data (raw format)
 *
 * Represents records returned directly from Grist API.
 * Use RawApiRecord for unprocessed responses, this for typed field access.
 *
 * @example
 * ```typescript
 * const response = await client.get<GristRecordsResponse>(
 *   `/docs/${docId}/tables/Tasks/records`
 * )
 * response.records.forEach(record => {
 *   console.log(record.fields.Title)
 * })
 * ```
 */
export interface GristRecordData {
  id: number
  fields: Record<string, unknown>
}

/**
 * Grist API records list response
 */
export interface GristRecordsResponse {
  records: GristRecordData[]
}

/**
 * Grist API table metadata
 */
export interface GristTableMetadata {
  id: string
  fields: {
    primaryViewId?: number
    rawViewSectionRef?: number
    [key: string]: unknown
  }
}

/**
 * Grist API tables list response
 */
export interface GristTablesResponse {
  tables: GristTableMetadata[]
}
