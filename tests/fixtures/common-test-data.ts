/**
 * Common test data used across multiple test files.
 * Eliminates duplication of person records in 15 files (117+ occurrences).
 */

import type { GristClient } from '../../src/client.js'
import type { DocId, TableId } from '../../src/schemas/ids.js'
import { addTestRecords } from '../helpers/grist-api.js'

/** Standard person records for testing */
export const STANDARD_PEOPLE = [
  { Name: 'Alice Johnson', Email: 'alice@example.com', Department: 'Engineering' },
  { Name: 'Bob Smith', Email: 'bob@example.com', Department: 'Sales' },
  { Name: 'Carol White', Email: 'carol@example.com', Department: 'Marketing' }
] as const

/** Person type for type safety */
export type StandardPerson = (typeof STANDARD_PEOPLE)[number]

/**
 * Insert standard people records into a table.
 * Returns record IDs in [Alice, Bob, Carol] order.
 */
export async function insertStandardPeople(
  client: GristClient,
  docId: DocId,
  tableId: TableId
): Promise<[number, number, number]> {
  const ids = await addTestRecords(
    client,
    docId,
    tableId,
    STANDARD_PEOPLE.map((p) => ({ fields: p }))
  )
  return [ids[0], ids[1], ids[2]]
}

/**
 * Find person record by name from an array of records.
 */
export function findPerson(
  records: Array<{ fields: Record<string, unknown> }>,
  name: 'Alice Johnson' | 'Bob Smith' | 'Carol White'
) {
  return records.find((r) => r.fields.Name === name)
}

/** Product test data */
export const STANDARD_PRODUCTS = [
  { Name: 'Widget', Price: 9.99, Category: 'Hardware' },
  { Name: 'Gadget', Price: 19.99, Category: 'Electronics' },
  { Name: 'Gizmo', Price: 29.99, Category: 'Electronics' }
] as const
