/**
 * CellValue Encoding Tests
 *
 * TDD approach: Validate all GristObjCode types against live Grist instance
 * Following the Red-Green-Refactor cycle for each CellValue type
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CellValue } from '../../src/schemas/api-responses.js'
import {
  createCensored,
  createDate,
  createDateTime,
  createDict,
  createException,
  createList,
  createPending,
  createReference,
  createReferenceList,
  createUnmarshallable,
  extractDate,
  extractDateTime,
  extractDict,
  extractListItems,
  extractReference,
  extractReferenceList,
  GristObjCode,
  getCellValueType,
  isDate,
  isDateTime,
  isDict,
  isList,
  isPending,
  isReference,
  isReferenceList,
  SAMPLE_CELL_VALUES,
  validateCellValue
} from '../helpers/cell-values.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'

// Type for Grist records API response
interface RecordData {
  id: number
  fields: Record<string, CellValue>
}

interface RecordsResponse {
  records: RecordData[]
}

describe('CellValue Encoding - All GristObjCode Types', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    // Ensure Grist is ready
    await ensureGristReady()

    // Create test context with comprehensive table
    // Using column "A" with Any type to support all CellValue types
    context = await createFullTestContext(client, {
      docName: 'CellValue Test Doc',
      tableName: 'CellValueTestTable',
      columns: [{ id: 'A', fields: { type: 'Any', label: 'Test Column' } }]
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Primitive CellValues', () => {
    it('should handle string values', async () => {
      // Red: Define expected behavior
      const testString = 'Hello World'

      // Green: Verify against live Grist
      const recordIds = await addTestRecords(client, context.docId, context.tableId, [
        { fields: { A: testString } }
      ])

      const records = await client.get<RecordsResponse>(
        `/docs/${context.docId}/tables/${context.tableId}/records`
      )

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(record?.fields.A).toBe(testString)
      expect(typeof record?.fields.A).toBe('string')
    })

    it('should handle number values', async () => {
      const testNumber = 42.5

      const recordIds = await addTestRecords(client, context.docId, context.tableId, [
        { fields: { A: testNumber } }
      ])

      const records = await client.get<RecordsResponse>(
        `/docs/${context.docId}/tables/${context.tableId}/records`
      )

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(record?.fields.A).toBe(testNumber)
      expect(typeof record?.fields.A).toBe('number')
    })

    it('should handle boolean values', async () => {
      const testBool = true

      const recordIds = await addTestRecords(client, context.docId, context.tableId, [
        { fields: { A: testBool } }
      ])

      const records = await client.get<RecordsResponse>(
        `/docs/${context.docId}/tables/${context.tableId}/records`
      )

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(record?.fields.A).toBe(testBool)
      expect(typeof record?.fields.A).toBe('boolean')
    })

    it('should handle null values', async () => {
      const recordIds = await addTestRecords(client, context.docId, context.tableId, [
        { fields: { A: null } }
      ])

      const records = await client.get<RecordsResponse>(
        `/docs/${context.docId}/tables/${context.tableId}/records`
      )

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(record?.fields.A).toBeNull()
    })
  })

  describe('GristObjCode.List - ["L", ...items]', () => {
    it('should encode and decode list of strings', async () => {
      const listValue = createList('cat', 'dog', 'bird')

      expect(isList(listValue)).toBe(true)
      expect(extractListItems(listValue)).toEqual(['cat', 'dog', 'bird'])
      expect(getCellValueType(listValue)).toBe('List')
    })

    it('should encode and decode list of numbers', async () => {
      const listValue = createList(1, 2, 3, 4, 5)

      expect(isList(listValue)).toBe(true)
      expect(extractListItems(listValue)).toEqual([1, 2, 3, 4, 5])
    })

    it('should encode and decode empty list', async () => {
      const listValue = createList()

      expect(isList(listValue)).toBe(true)
      expect(extractListItems(listValue)).toEqual([])
    })

    it('should validate list structure', () => {
      expect(validateCellValue(createList('a', 'b'))).toBe(true)
      expect(validateCellValue(['L'])).toBe(true) // Empty list is valid
      expect(validateCellValue(['L', 1, 2, 3])).toBe(true)
    })
  })

  describe('GristObjCode.DateTime - ["D", timestamp, timezone]', () => {
    it('should encode DateTime with UTC timezone', () => {
      const dateTime = createDateTime(1704945919, 'UTC')

      expect(isDateTime(dateTime)).toBe(true)
      expect(getCellValueType(dateTime)).toBe('DateTime')

      const extracted = extractDateTime(dateTime)
      expect(extracted).toEqual({ timestamp: 1704945919, timezone: 'UTC' })
    })

    it('should encode DateTime with America/New_York timezone', () => {
      const dateTime = createDateTime(1704945919, 'America/New_York')

      expect(isDateTime(dateTime)).toBe(true)

      const extracted = extractDateTime(dateTime)
      expect(extracted?.timezone).toBe('America/New_York')
    })

    it('should encode DateTime with Europe/London timezone', () => {
      const dateTime = createDateTime(1704945919, 'Europe/London')

      expect(isDateTime(dateTime)).toBe(true)

      const extracted = extractDateTime(dateTime)
      expect(extracted?.timezone).toBe('Europe/London')
    })

    it('should validate DateTime structure', () => {
      expect(validateCellValue(createDateTime(0, 'UTC'))).toBe(true)
      expect(validateCellValue(['D', 123456, 'America/New_York'])).toBe(true)
    })
  })

  describe('GristObjCode.Date - ["d", timestamp]', () => {
    it('should encode Date value', () => {
      const date = createDate(1704844800)

      expect(isDate(date)).toBe(true)
      expect(getCellValueType(date)).toBe('Date')

      const timestamp = extractDate(date)
      expect(timestamp).toBe(1704844800)
    })

    it('should encode epoch date', () => {
      const date = createDate(0)

      expect(isDate(date)).toBe(true)
      expect(extractDate(date)).toBe(0)
    })

    it('should validate Date structure', () => {
      expect(validateCellValue(createDate(123456))).toBe(true)
      expect(validateCellValue(['d', 0])).toBe(true)
    })
  })

  describe('GristObjCode.Reference - ["R", tableId, rowId]', () => {
    it('should encode Reference value', () => {
      const ref = createReference('People', 17)

      expect(isReference(ref)).toBe(true)
      expect(getCellValueType(ref)).toBe('Reference')

      const extracted = extractReference(ref)
      expect(extracted).toEqual({ tableId: 'People', rowId: 17 })
    })

    it('should encode Reference to different table', () => {
      const ref = createReference('Orders', 1)

      expect(isReference(ref)).toBe(true)

      const extracted = extractReference(ref)
      expect(extracted?.tableId).toBe('Orders')
      expect(extracted?.rowId).toBe(1)
    })

    it('should validate Reference structure', () => {
      expect(validateCellValue(createReference('Table1', 1))).toBe(true)
      expect(validateCellValue(['R', 'Users', 42])).toBe(true)
    })
  })

  describe('GristObjCode.ReferenceList - ["r", tableId, [rowIds]]', () => {
    it('should encode ReferenceList with multiple IDs', () => {
      const refList = createReferenceList('People', [1, 2, 3])

      expect(isReferenceList(refList)).toBe(true)
      expect(getCellValueType(refList)).toBe('ReferenceList')

      const extracted = extractReferenceList(refList)
      expect(extracted).toEqual({ tableId: 'People', rowIds: [1, 2, 3] })
    })

    it('should encode ReferenceList with single ID', () => {
      const refList = createReferenceList('Tags', [5])

      expect(isReferenceList(refList)).toBe(true)

      const extracted = extractReferenceList(refList)
      expect(extracted?.rowIds).toEqual([5])
    })

    it('should encode empty ReferenceList', () => {
      const refList = createReferenceList('People', [])

      expect(isReferenceList(refList)).toBe(true)

      const extracted = extractReferenceList(refList)
      expect(extracted?.rowIds).toEqual([])
    })

    it('should validate ReferenceList structure', () => {
      expect(validateCellValue(createReferenceList('Table1', [1, 2]))).toBe(true)
      expect(validateCellValue(['r', 'Users', []])).toBe(true)
    })
  })

  describe('GristObjCode.Dict - ["O", {key: value}]', () => {
    it('should encode Dict with simple values', () => {
      const dict = createDict({ name: 'John', age: 30, active: true })

      expect(isDict(dict)).toBe(true)
      expect(getCellValueType(dict)).toBe('Dict')

      const extracted = extractDict(dict)
      expect(extracted).toEqual({ name: 'John', age: 30, active: true })
    })

    it('should encode empty Dict', () => {
      const dict = createDict({})

      expect(isDict(dict)).toBe(true)

      const extracted = extractDict(dict)
      expect(extracted).toEqual({})
    })

    it('should encode nested Dict', () => {
      const dict = createDict({
        user: { id: 1, name: 'Alice' },
        meta: { created: 123456 }
      })

      expect(isDict(dict)).toBe(true)

      const extracted = extractDict(dict)
      expect(extracted?.user).toEqual({ id: 1, name: 'Alice' })
    })

    it('should validate Dict structure', () => {
      expect(validateCellValue(createDict({ a: 1 }))).toBe(true)
      expect(validateCellValue(['O', {}])).toBe(true)
    })
  })

  describe('Special CellValue Types', () => {
    it('should encode Censored - ["C"]', () => {
      const censored = createCensored()

      expect(censored).toEqual([GristObjCode.Censored])
      expect(getCellValueType(censored)).toBe('Censored')
      expect(validateCellValue(censored)).toBe(true)
    })

    it('should encode Exception - ["E", errorName]', () => {
      const exception = createException('ValueError', 'Invalid input')

      expect(exception[0]).toBe(GristObjCode.Exception)
      expect(exception[1]).toBe('ValueError')
      expect(getCellValueType(exception)).toBe('Exception')
      expect(validateCellValue(exception)).toBe(true)
    })

    it('should encode Pending - ["P"]', () => {
      const pending = createPending()

      expect(isPending(pending)).toBe(true)
      expect(pending).toEqual([GristObjCode.Pending])
      expect(getCellValueType(pending)).toBe('Pending')
      expect(validateCellValue(pending)).toBe(true)
    })

    it('should encode Unmarshallable - ["U", text]', () => {
      const unmarshallable = createUnmarshallable('unparseable data')

      expect(unmarshallable).toEqual([GristObjCode.Unmarshallable, 'unparseable data'])
      expect(getCellValueType(unmarshallable)).toBe('Unmarshallable')
      expect(validateCellValue(unmarshallable)).toBe(true)
    })
  })

  describe('Sample CellValues Validation', () => {
    it('should validate all sample primitive values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.primitiveString)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.primitiveNumber)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.primitiveBoolean)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.primitiveNull)).toBe(true)
    })

    it('should validate all sample List values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.list)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.listNumbers)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.emptyList)).toBe(true)
    })

    it('should validate all sample DateTime values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.dateTime)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.dateTimeNewYork)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.dateTimeLondon)).toBe(true)
    })

    it('should validate all sample Date values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.date)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.dateEpoch)).toBe(true)
    })

    it('should validate all sample Reference values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.reference)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.referenceOrders)).toBe(true)
    })

    it('should validate all sample ReferenceList values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.referenceList)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.referenceListEmpty)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.referenceListSingle)).toBe(true)
    })

    it('should validate all sample Dict values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.dict)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.emptyDict)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.nestedDict)).toBe(true)
    })

    it('should validate all special type values', () => {
      expect(validateCellValue(SAMPLE_CELL_VALUES.censored)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.exception)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.pending)).toBe(true)
      expect(validateCellValue(SAMPLE_CELL_VALUES.unmarshallable)).toBe(true)
    })
  })

  describe('Invalid CellValues', () => {
    it('should reject invalid CellValue structures', () => {
      expect(validateCellValue([])).toBe(false) // Empty array
      expect(validateCellValue([123])).toBe(false) // Non-string code
      expect(validateCellValue(['XY'])).toBe(false) // Invalid code (length > 1)
      expect(validateCellValue(['Z'])).toBe(false) // Unknown code
      expect(validateCellValue({ key: 'value' })).toBe(false) // Plain object
      expect(validateCellValue(undefined)).toBe(false)
    })
  })
})
