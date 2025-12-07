/**
 * Custom Vitest Matchers for Grist MCP Testing
 *
 * Provides domain-specific matchers for better test readability and error messages.
 */

import { expect } from 'vitest'
import type { MCPToolResponse } from '../../src/types.js'
import {
  isValidColumnId,
  isValidDocId,
  isValidTableId
} from '../../src/utils/identifier-validation.js'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveSuccessResponse(): T
    toHaveErrorResponse(messagePattern?: string | RegExp): T
    toHaveRecordIds(count: number): T
    toHaveRecordsMatching(fields: Record<string, unknown>): T
    toBeValidDocId(): T
    toBeValidTableId(): T
    toBeValidColumnId(): T
    toHaveColumnWithType(colId: string, type: string): T
  }

  interface AsymmetricMatchersContaining {
    toHaveSuccessResponse(): unknown
    toHaveErrorResponse(messagePattern?: string | RegExp): unknown
    toHaveRecordIds(count: number): unknown
    toHaveRecordsMatching(fields: Record<string, unknown>): unknown
    toBeValidDocId(): unknown
    toBeValidTableId(): unknown
    toBeValidColumnId(): unknown
    toHaveColumnWithType(colId: string, type: string): unknown
  }
}

expect.extend({
  /**
   * Assert MCP tool response is successful
   *
   * @example
   * ```typescript
   * const result = await getTables(toolContext, { docId })
   * expect(result).toHaveSuccessResponse()
   * ```
   */
  toHaveSuccessResponse(response: MCPToolResponse) {
    const isSuccess = !response.isError && response.content.length > 0
    return {
      pass: isSuccess,
      message: () =>
        isSuccess
          ? 'Expected error response, got success'
          : `Expected success response, got error: ${response.content[0]?.text || 'unknown'}`
    }
  },

  /**
   * Assert MCP tool response is an error (optionally matching pattern)
   *
   * @example
   * ```typescript
   * const result = await getTables(toolContext, { docId: 'invalid' })
   * expect(result).toHaveErrorResponse(/not found/i)
   * ```
   */
  toHaveErrorResponse(response: MCPToolResponse, messagePattern?: string | RegExp) {
    const isError = response.isError

    if (!isError) {
      return {
        pass: false,
        message: () => 'Expected error response, got success'
      }
    }

    if (messagePattern) {
      const errorText = response.content[0]?.text || ''
      const matches =
        typeof messagePattern === 'string'
          ? errorText.includes(messagePattern)
          : messagePattern.test(errorText)

      return {
        pass: matches,
        message: () =>
          matches
            ? `Expected error not to match ${messagePattern}`
            : `Expected error to match ${messagePattern}, got: ${errorText}`
      }
    }

    return {
      pass: true,
      message: () => 'Expected success response, got error'
    }
  },

  /**
   * Assert MCP add/upsert response has expected number of record IDs
   *
   * @example
   * ```typescript
   * const result = await addRecords(toolContext, { docId, tableId, records: [...] })
   * expect(result).toHaveRecordIds(3)
   * ```
   */
  toHaveRecordIds(response: MCPToolResponse, expectedCount: number) {
    const data = response.structuredContent as { record_ids?: number[]; row_ids?: number[] }
    const actualCount = (data.record_ids || data.row_ids || []).length

    return {
      pass: actualCount === expectedCount,
      message: () => `Expected ${expectedCount} record IDs, got ${actualCount}`
    }
  },

  /**
   * Assert array of records contains at least one matching given fields
   *
   * @example
   * ```typescript
   * const records = await getTableRecords(client, docId, 'Users')
   * expect(records).toHaveRecordsMatching({ Email: 'alice@example.com' })
   * ```
   */
  toHaveRecordsMatching(records: unknown[], expectedFields: Record<string, unknown>) {
    if (!Array.isArray(records)) {
      return {
        pass: false,
        message: () => 'Expected array of records'
      }
    }

    const match = records.some((record) => {
      const fields = record.fields || record
      return Object.entries(expectedFields).every(([key, value]) => fields[key] === value)
    })

    return {
      pass: match,
      message: () =>
        match
          ? `Expected records not to contain ${JSON.stringify(expectedFields)}`
          : `Expected records to contain entry matching ${JSON.stringify(expectedFields)}`
    }
  },

  /**
   * Assert string is a valid Grist document ID
   *
   * @example
   * ```typescript
   * const docId = await createDocument(...)
   * expect(docId).toBeValidDocId()
   * ```
   */
  toBeValidDocId(value: string) {
    const isValid = isValidDocId(value)
    return {
      pass: isValid,
      message: () =>
        isValid
          ? `Expected ${value} not to be a valid DocId`
          : `Expected ${value} to be a valid DocId (22 char Base58, no 0OIl)`
    }
  },

  /**
   * Assert string is a valid Grist table ID
   *
   * @example
   * ```typescript
   * const tableId = await createTable(...)
   * expect(tableId).toBeValidTableId()
   * ```
   */
  toBeValidTableId(value: string) {
    const isValid = isValidTableId(value)
    return {
      pass: isValid,
      message: () =>
        isValid
          ? `Expected ${value} not to be a valid TableId`
          : `Expected ${value} to be a valid TableId (UPPERCASE start, Python identifier)`
    }
  },

  /**
   * Assert string is a valid Grist column ID
   *
   * @example
   * ```typescript
   * expect('Email').toBeValidColumnId()
   * expect('gristHelper_Display').not.toBeValidColumnId()
   * ```
   */
  toBeValidColumnId(value: string) {
    const isValid = isValidColumnId(value)
    return {
      pass: isValid,
      message: () =>
        isValid
          ? `Expected ${value} not to be a valid ColumnId`
          : `Expected ${value} to be a valid ColumnId (Python identifier, no gristHelper_ prefix)`
    }
  },

  /**
   * Assert array of columns contains a column with specified ID and type
   *
   * @example
   * ```typescript
   * const columns = await getAllColumns(client, docId, 'Users')
   * expect(columns).toHaveColumnWithType('Status', 'Choice')
   * ```
   */
  toHaveColumnWithType(columns: unknown[], colId: string, expectedType: string) {
    if (!Array.isArray(columns)) {
      return {
        pass: false,
        message: () => 'Expected array of columns'
      }
    }

    const column = columns.find((c) => c.id === colId)
    if (!column) {
      return {
        pass: false,
        message: () => `Column ${colId} not found`
      }
    }

    const actualType = column.fields?.type
    const matches = actualType === expectedType

    return {
      pass: matches,
      message: () =>
        matches
          ? `Expected column ${colId} not to have type ${expectedType}`
          : `Expected column ${colId} to have type ${expectedType}, got ${actualType}`
    }
  }
})
