/**
 * visibleCol Tests - Validation of column name resolution for Reference columns
 *
 * Tests the new visibleCol functionality that allows:
 * 1. Setting visibleCol with column names (auto-resolved to numeric IDs)
 * 2. Setting visibleCol with numeric column IDs (pass-through)
 * 3. Error handling for invalid column names
 * 4. Both Ref and RefList column types
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestClient,
  createFullTestContext,
  cleanupTestContext,
  createTestTable
} from './helpers/grist-api.js'
import { ensureGristReady } from './helpers/docker.js'
import { manageColumns } from '../src/tools/columns.js'
import type { DocId, TableId } from '../src/types/advanced.js'

describe('visibleCol - Column Name Resolution', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let peopleTableId: TableId
  let tasksTableId: TableId
  let projectsTableId: TableId
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    // Create base context with People table
    context = await createFullTestContext(client, {
      docName: 'visibleCol Test Doc',
      tableName: 'People',
      columns: [
        { id: 'FirstName', fields: { type: 'Text', label: 'First Name' } },
        { id: 'LastName', fields: { type: 'Text', label: 'Last Name' } },
        { id: 'Email', fields: { type: 'Text', label: 'Email Address' } },
        { id: 'Department', fields: { type: 'Text', label: 'Department' } }
      ]
    })

    docId = context.docId
    peopleTableId = context.tableId

    // Create Tasks table
    tasksTableId = await createTestTable(client, docId, 'Tasks', [
      { id: 'Title', fields: { type: 'Text', label: 'Title' } }
    ])

    // Create Projects table for batch operations test
    projectsTableId = await createTestTable(client, docId, 'Projects', [
      { id: 'ProjectName', fields: { type: 'Text', label: 'Project Name' } }
    ])
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  /**
   * Helper to get column information including widgetOptions
   */
  async function getColumnInfo(tableId: TableId, colId: string) {
    const response = await client.get<{ columns: any[] }>(
      `/docs/${docId}/tables/${tableId}/columns`
    )
    const column = response.columns.find((c: any) => c.id === colId)
    if (!column) {
      throw new Error(`Column ${colId} not found in table ${tableId}`)
    }
    return column
  }

  /**
   * Helper to get the numeric column ID (colRef) for a column name
   */
  async function getColumnNumericId(tableId: TableId, colId: string): Promise<number> {
    const col = await getColumnInfo(tableId, colId)
    return col.fields.colRef
  }

  /**
   * Helper to add test records to a table
   */
  async function addRecords(tableId: TableId, records: Array<{ fields: any }>) {
    const response = await client.post<{ records: number[] }>(
      `/docs/${docId}/tables/${tableId}/records`,
      { records }
    )
    return response.records
  }

  /**
   * Helper to get records from a table
   */
  async function getRecords(tableId: TableId) {
    const response = await client.get<{ records: Array<{ id: number; fields: any }> }>(
      `/docs/${docId}/tables/${tableId}/records`
    )
    return response.records
  }

  describe('Ref Column - visibleCol with column name (string)', () => {
    it('should create Ref column with visibleCol as column name and verify via SQL', async () => {
      // First, get the numeric ID of the FirstName column in People table
      const firstNameNumericId = await getColumnNumericId(peopleTableId, 'FirstName')
      expect(firstNameNumericId).toBeGreaterThan(0)

      // Add a Manager column with visibleCol to existing Tasks table
      const addColResult = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'Manager',
            type: 'Ref:People',
            label: 'Project Manager',
            widgetOptions: {
              visibleCol: 'FirstName' // Should be auto-resolved to numeric ID
            }
          }
        ],
        response_format: 'json'
      })

      expect(addColResult.content[0].text).toContain('success')

      // Verify the column was created with resolved visibleCol
      const managerCol = await getColumnInfo(tasksTableId, 'Manager')
      expect(managerCol.fields.type).toBe('Ref:People')

      // visibleCol should be a separate field, not inside widgetOptions
      expect(managerCol.fields.visibleCol).toBeDefined()
      expect(typeof managerCol.fields.visibleCol).toBe('number')

      // CRITICAL: Verify the numeric ID matches the FirstName column
      // This validates the visibleCol was properly stored in the database
      expect(managerCol.fields.visibleCol).toBe(firstNameNumericId)

      // SQL VALIDATION: Query _grist_Tables_column directly - visibleCol is a separate column
      const sqlResponse = await client.post(`/docs/${docId}/sql`, {
        sql: 'SELECT colId, type, visibleCol, displayCol FROM _grist_Tables_column WHERE colId = ?',
        args: ['Manager']
      })

      expect(sqlResponse.records).toHaveLength(1)
      const record = sqlResponse.records[0].fields

      expect(record.colId).toBe('Manager')
      expect(record.type).toBe('Ref:People')

      // visibleCol should be stored as a separate column field, not inside widgetOptions
      expect(record.visibleCol).toBe(firstNameNumericId)

      // CRITICAL: displayCol should be created and point to helper column (not 0)
      expect(record.displayCol).toBeGreaterThan(0)
      console.log(`✓ displayCol created: ${record.displayCol} (helper column for Manager)`)
    })

    it('should create Ref column with different visibleCol and verify via SQL', async () => {
      // Get numeric IDs for Email and FirstName - they should be different
      const emailNumericId = await getColumnNumericId(peopleTableId, 'Email')
      const firstNameNumericId = await getColumnNumericId(peopleTableId, 'FirstName')

      expect(emailNumericId).toBeGreaterThan(0)
      expect(firstNameNumericId).toBeGreaterThan(0)
      expect(emailNumericId).not.toBe(firstNameNumericId)

      const addColResult = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'AssignedTo',
            type: 'Ref:People',
            label: 'Assigned To',
            widgetOptions: {
              visibleCol: 'Email' // Different column
            }
          }
        ],
        response_format: 'json'
      })

      expect(addColResult.content[0].text).toContain('success')

      const assignedToCol = await getColumnInfo(tasksTableId, 'AssignedTo')

      expect(assignedToCol.fields.visibleCol).toBeDefined()
      expect(typeof assignedToCol.fields.visibleCol).toBe('number')

      // CRITICAL: Verify it resolved to the Email column ID, not FirstName
      // This validates the correct visibleCol was stored in the database
      expect(assignedToCol.fields.visibleCol).toBe(emailNumericId)
      expect(assignedToCol.fields.visibleCol).not.toBe(firstNameNumericId)

      // SQL VALIDATION: Verify visibleCol in database points to Email, not FirstName
      const sqlResponse = await client.post(`/docs/${docId}/sql`, {
        sql: 'SELECT colId, type, visibleCol, displayCol FROM _grist_Tables_column WHERE colId = ?',
        args: ['AssignedTo']
      })

      expect(sqlResponse.records).toHaveLength(1)
      const record = sqlResponse.records[0].fields

      expect(record.colId).toBe('AssignedTo')
      expect(record.visibleCol).toBe(emailNumericId)
      expect(record.visibleCol).not.toBe(firstNameNumericId)

      // CRITICAL: displayCol should be created and point to helper column (not 0)
      expect(record.displayCol).toBeGreaterThan(0)
      console.log(`✓ displayCol created: ${record.displayCol} (helper column for AssignedTo)`)
    })

    it('should handle error for non-existent column name', async () => {
      const addColResult = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'BadRef',
            type: 'Ref:People',
            widgetOptions: {
              visibleCol: 'NonExistentColumn'
            }
          }
        ],
        response_format: 'json'
      })

      // Should return an error
      expect(addColResult.isError).toBe(true)
      expect(addColResult.content[0].text).toContain('NonExistentColumn')
      expect(addColResult.content[0].text).toContain('not found')
    })

    it('should handle case-sensitive column names', async () => {
      // Try with wrong case - should fail
      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'CaseTest',
            type: 'Ref:People',
            widgetOptions: {
              visibleCol: 'firstname' // Wrong case - should fail
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('firstname')
      expect(result.content[0].text).toContain('not found')
    })
  })

  describe('Ref Column - visibleCol with numeric ID', () => {
    it('should create Ref column with visibleCol as numeric ID (pass-through)', async () => {
      // First, get the numeric ID of the Department column
      const deptCol = await getColumnInfo(peopleTableId, 'Department')
      const numericColId = deptCol.fields.colRef

      expect(typeof numericColId).toBe('number')
      expect(numericColId).toBeGreaterThan(0)

      // Create Ref column with numeric visibleCol
      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'Approver',
            type: 'Ref:People',
            label: 'Approver',
            widgetOptions: {
              visibleCol: numericColId // Numeric ID - should pass through
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.content[0].text).toContain('success')

      const approverCol = await getColumnInfo(tasksTableId, 'Approver')

      expect(approverCol.fields.visibleCol).toBe(numericColId)
    })
  })

  describe('RefList Column - visibleCol support', () => {
    it('should create RefList column with visibleCol and verify via SQL', async () => {
      // Get the numeric ID for LastName column
      const lastNameNumericId = await getColumnNumericId(peopleTableId, 'LastName')
      expect(lastNameNumericId).toBeGreaterThan(0)

      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'Reviewers',
            type: 'RefList:People',
            label: 'Reviewers',
            widgetOptions: {
              visibleCol: 'LastName'
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.content[0].text).toContain('success')

      const reviewersCol = await getColumnInfo(tasksTableId, 'Reviewers')
      expect(reviewersCol.fields.type).toBe('RefList:People')

      expect(reviewersCol.fields.visibleCol).toBeDefined()
      expect(typeof reviewersCol.fields.visibleCol).toBe('number')

      // CRITICAL: Verify it resolved to the LastName column ID
      // This validates visibleCol works for RefList columns too
      expect(reviewersCol.fields.visibleCol).toBe(lastNameNumericId)

      // SQL VALIDATION: Query _grist_Tables_column to verify visibleCol for RefList
      const sqlResponse = await client.post(`/docs/${docId}/sql`, {
        sql: 'SELECT colId, type, visibleCol, displayCol FROM _grist_Tables_column WHERE colId = ?',
        args: ['Reviewers']
      })

      expect(sqlResponse.records).toHaveLength(1)
      const record = sqlResponse.records[0].fields

      expect(record.colId).toBe('Reviewers')
      expect(record.type).toBe('RefList:People')

      expect(record.visibleCol).toBe(lastNameNumericId)

      // CRITICAL: displayCol should be created for RefList columns too
      expect(record.displayCol).toBeGreaterThan(0)
      console.log(`✓ displayCol created: ${record.displayCol} (helper column for Reviewers RefList)`)
    })
  })

  describe('ModifyColumn - changing visibleCol', () => {
    it('should modify existing column to change visibleCol', async () => {
      // First create a column with one visibleCol
      await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'Lead',
            type: 'Ref:People',
            widgetOptions: {
              visibleCol: 'FirstName'
            }
          }
        ],
        response_format: 'json'
      })

      // Now modify it to use a different visibleCol
      const modifyResult = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'modify',
            colId: 'Lead',
            type: 'Ref:People', // Must provide type when setting visibleCol
            widgetOptions: {
              visibleCol: 'Email' // Change to Email
            }
          }
        ],
        response_format: 'json'
      })

      expect(modifyResult.content[0].text).toContain('success')

      const leadCol = await getColumnInfo(tasksTableId, 'Lead')

      expect(leadCol.fields.visibleCol).toBeDefined()
      expect(typeof leadCol.fields.visibleCol).toBe('number')

      // SQL VALIDATION: Verify displayCol is updated after modifying visibleCol
      const sqlResponse = await client.post(`/docs/${docId}/sql`, {
        sql: 'SELECT colId, type, visibleCol, displayCol FROM _grist_Tables_column WHERE colId = ?',
        args: ['Lead']
      })

      expect(sqlResponse.records).toHaveLength(1)
      const record = sqlResponse.records[0].fields

      expect(record.colId).toBe('Lead')
      // CRITICAL: displayCol should still be set after modification
      expect(record.displayCol).toBeGreaterThan(0)
      console.log(`✓ displayCol updated: ${record.displayCol} (helper column for Lead after modify)`)
    })

    it('should fail if modifying visibleCol without providing type', async () => {
      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'modify',
            colId: 'Manager',
            // type not provided - should fail
            widgetOptions: {
              visibleCol: 'LastName'
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('no type specified')
    })
  })

  describe('Error handling - visibleCol on non-Ref columns', () => {
    it('should fail when setting visibleCol on Text column', async () => {
      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'InvalidCol',
            type: 'Text', // Not a Ref type
            widgetOptions: {
              visibleCol: 'FirstName'
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not a Ref or RefList type')
    })

    it('should fail when setting visibleCol on Numeric column', async () => {
      const result = await manageColumns(client, {
        docId,
        tableId: tasksTableId,
        operations: [
          {
            action: 'add',
            colId: 'InvalidNumeric',
            type: 'Numeric',
            widgetOptions: {
              visibleCol: 123
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not a Ref or RefList type')
    })
  })

  describe('Batch operations with visibleCol', () => {
    it('should handle multiple Ref columns with visibleCol and verify via SQL', async () => {
      // Get expected numeric IDs for all three columns
      const firstNameNumericId = await getColumnNumericId(peopleTableId, 'FirstName')
      const emailNumericId = await getColumnNumericId(peopleTableId, 'Email')
      const lastNameNumericId = await getColumnNumericId(peopleTableId, 'LastName')

      // All IDs should be different
      expect(firstNameNumericId).not.toBe(emailNumericId)
      expect(emailNumericId).not.toBe(lastNameNumericId)
      expect(firstNameNumericId).not.toBe(lastNameNumericId)

      const result = await manageColumns(client, {
        docId,
        tableId: projectsTableId,
        operations: [
          {
            action: 'add',
            colId: 'Owner',
            type: 'Ref:People',
            widgetOptions: {
              visibleCol: 'FirstName'
            }
          },
          {
            action: 'add',
            colId: 'Sponsor',
            type: 'Ref:People',
            widgetOptions: {
              visibleCol: 'Email'
            }
          },
          {
            action: 'add',
            colId: 'TeamMembers',
            type: 'RefList:People',
            widgetOptions: {
              visibleCol: 'LastName'
            }
          }
        ],
        response_format: 'json'
      })

      expect(result.content[0].text).toContain('success')

      // Verify all columns were created with resolved visibleCol
      const ownerCol = await getColumnInfo(projectsTableId, 'Owner')
      const sponsorCol = await getColumnInfo(projectsTableId, 'Sponsor')
      const teamCol = await getColumnInfo(projectsTableId, 'TeamMembers')

      // CRITICAL: Verify each resolved to the correct column ID
      expect(ownerCol.fields.visibleCol).toBe(firstNameNumericId)
      expect(sponsorCol.fields.visibleCol).toBe(emailNumericId)
      expect(teamCol.fields.visibleCol).toBe(lastNameNumericId)

      // They should all be different (different columns)
      // This validates batch operations correctly resolve multiple visibleCol values
      expect(ownerCol.fields.visibleCol).not.toBe(sponsorCol.fields.visibleCol)
      expect(sponsorCol.fields.visibleCol).not.toBe(teamCol.fields.visibleCol)

      // SQL VALIDATION: Query all three columns and verify database state
      const sqlResponse = await client.post(`/docs/${docId}/sql`, {
        sql: "SELECT colId, type, visibleCol FROM _grist_Tables_column WHERE colId IN (?, ?, ?) ORDER BY colId",
        args: ['Owner', 'Sponsor', 'TeamMembers']
      })

      expect(sqlResponse.records).toHaveLength(3)

      const ownerRecord = sqlResponse.records.find((r: any) => r.fields.colId === 'Owner')
      const sponsorRecord = sqlResponse.records.find((r: any) => r.fields.colId === 'Sponsor')
      const teamRecord = sqlResponse.records.find((r: any) => r.fields.colId === 'TeamMembers')

      expect(ownerRecord.fields.colId).toBe('Owner')
      expect(sponsorRecord.fields.colId).toBe('Sponsor')
      expect(teamRecord.fields.colId).toBe('TeamMembers')

      expect(ownerRecord.fields.visibleCol).toBe(firstNameNumericId)
      expect(sponsorRecord.fields.visibleCol).toBe(emailNumericId)
      expect(teamRecord.fields.visibleCol).toBe(lastNameNumericId)
    })
  })
})
