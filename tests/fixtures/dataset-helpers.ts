/**
 * Dataset Helpers
 *
 * Utilities for using standard datasets in both unit and integration tests.
 */

import type { CellValue } from '../../src/schemas/api-responses.js'
import type { GristClient } from '../../src/services/grist-client.js'
import type { DocId, TableId } from '../../src/types/advanced.js'
import { addTestRecords, createTestTable } from '../helpers/grist-api.js'
import type { Dataset, DatasetColumn } from './standard-datasets.js'

// =============================================================================
// Unit Test Helpers - Mock data generation
// =============================================================================

/**
 * Generate mock column metadata from a dataset.
 * Use this in unit tests to mock SchemaCache responses.
 */
export function mockColumnsFromDataset(dataset: Dataset): Array<{
  id: string
  type: string
  label: string
  widgetOptions?: string
}> {
  return dataset.columns.map((col) => ({
    id: col.id,
    type: col.type,
    label: col.label || col.id,
    ...(col.widgetOptions && { widgetOptions: JSON.stringify(col.widgetOptions) })
  }))
}

/**
 * Generate mock records from a dataset.
 * Use this in unit tests to mock API responses.
 */
export function mockRecordsFromDataset(
  dataset: Dataset,
  startId: number = 1
): Array<{ id: number; fields: Record<string, CellValue> }> {
  return dataset.records.map((fields, index) => ({
    id: startId + index,
    fields
  }))
}

/**
 * Generate mock table metadata from a dataset.
 * Use this in unit tests to mock table list responses.
 */
export function mockTableFromDataset(dataset: Dataset): {
  id: string
  fields: { tableRef: number; onDemand: boolean }
  columns: Array<{ id: string; fields: Record<string, unknown> }>
} {
  return {
    id: dataset.tableId,
    fields: { tableRef: 1, onDemand: false },
    columns: dataset.columns.map((col) => ({
      id: col.id,
      fields: {
        type: col.type,
        label: col.label || col.id,
        ...(col.widgetOptions && { widgetOptions: JSON.stringify(col.widgetOptions) })
      }
    }))
  }
}

/**
 * Create a mock GristClient response for getTableColumns.
 */
export function mockGetColumnsResponse(dataset: Dataset): {
  columns: Array<{ id: string; fields: Record<string, unknown> }>
} {
  return {
    columns: dataset.columns.map((col) => ({
      id: col.id,
      fields: {
        type: col.type,
        label: col.label || col.id,
        ...(col.widgetOptions && { widgetOptions: JSON.stringify(col.widgetOptions) })
      }
    }))
  }
}

/**
 * Create a mock GristClient response for getRecords.
 */
export function mockGetRecordsResponse(
  dataset: Dataset,
  startId: number = 1
): { records: Array<{ id: number; fields: Record<string, CellValue> }> } {
  return {
    records: mockRecordsFromDataset(dataset, startId)
  }
}

// =============================================================================
// Integration Test Helpers - Real Grist operations
// =============================================================================

/**
 * Convert dataset columns to Grist API format.
 */
function datasetColumnsToGristFormat(columns: DatasetColumn[]): Array<{
  id: string
  fields: Record<string, unknown>
}> {
  return columns.map((col) => {
    const fields: Record<string, unknown> = {
      type: col.type,
      label: col.label || col.id
    }

    if (col.widgetOptions) {
      fields.widgetOptions = JSON.stringify(col.widgetOptions)
    }

    return { id: col.id, fields }
  })
}

/**
 * Apply a dataset to a Grist document - creates table and inserts records.
 * Use this in integration tests to set up consistent test data.
 *
 * @param client - GristClient instance
 * @param docId - Document ID to create table in
 * @param dataset - Dataset to apply
 * @returns Object with tableId and record IDs
 */
export async function applyDataset(
  client: GristClient,
  docId: DocId,
  dataset: Dataset
): Promise<{ tableId: TableId; recordIds: number[] }> {
  // Create table with columns
  const columns = datasetColumnsToGristFormat(dataset.columns)
  const tableId = await createTestTable(client, docId, dataset.tableId, columns)

  // Insert records
  const recordIds = await addTestRecords(
    client,
    docId,
    tableId,
    dataset.records.map((fields) => ({ fields }))
  )

  return { tableId, recordIds }
}

/**
 * Apply multiple datasets to a document.
 * Useful for testing relationships (e.g., Departments + Employees).
 *
 * @param client - GristClient instance
 * @param docId - Document ID
 * @param datasets - Array of datasets to apply (order matters for references)
 */
export async function applyDatasets(
  client: GristClient,
  docId: DocId,
  datasets: Dataset[]
): Promise<Map<string, { tableId: TableId; recordIds: number[] }>> {
  const results = new Map<string, { tableId: TableId; recordIds: number[] }>()

  // Apply datasets in order (important for reference relationships)
  for (const dataset of datasets) {
    const result = await applyDataset(client, docId, dataset)
    results.set(dataset.tableId, result)
  }

  return results
}

// =============================================================================
// Test Case Generation Helpers
// =============================================================================

/**
 * Generate test cases for record operations from a dataset.
 * Returns objects suitable for parameterized tests.
 */
export function generateRecordTestCases(dataset: Dataset): Array<{
  name: string
  record: Record<string, CellValue>
  columnTypes: Record<string, string>
}> {
  const columnTypes = Object.fromEntries(dataset.columns.map((col) => [col.id, col.type]))

  return dataset.records.map((record, index) => ({
    name: `${dataset.tableId} record ${index + 1}`,
    record,
    columnTypes
  }))
}

/**
 * Get a subset of records from a dataset for targeted testing.
 */
export function getDatasetRecords(
  dataset: Dataset,
  filter?: (record: Record<string, CellValue>, index: number) => boolean
): Array<Record<string, CellValue>> {
  if (!filter) {
    return [...dataset.records]
  }
  return dataset.records.filter(filter)
}

/**
 * Get column IDs from a dataset.
 */
export function getDatasetColumnIds(dataset: Dataset): string[] {
  return dataset.columns.map((col) => col.id)
}

/**
 * Get columns of a specific type from a dataset.
 */
export function getColumnsByType(dataset: Dataset, type: string): DatasetColumn[] {
  return dataset.columns.filter((col) => col.type === type || col.type.startsWith(`${type}:`))
}
