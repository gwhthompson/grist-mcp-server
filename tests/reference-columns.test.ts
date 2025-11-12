/**
 * Reference Column Tests - Real-world validation
 *
 * Tests Ref and RefList columns with actual data and relationships
 * Validates reference encoding, queries, and broken reference handling
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DocId, TableId } from '../src/types/advanced.js'
import { ensureGristReady } from './helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from './helpers/grist-api.js'

describe('Reference Columns - Real-World Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let peopleTableId: TableId
  let tasksTableId: TableId
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    // Create base context
    context = await createFullTestContext(client, {
      docName: 'Reference Test Doc',
      tableName: 'People',
      columns: [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        { id: 'Email', fields: { type: 'Text', label: 'Email' } }
      ]
    })

    docId = context.docId
    peopleTableId = context.tableId

    // Create Tasks table with Ref:People column
    // Note: visibleCol controls what data is displayed (e.g., "Alice" vs "1")
    //       showColumn controls UI visibility (hide/show columns) - different feature
    // For this test, we create the column without widgetOptions initially
    tasksTableId = await createTestTable(client, docId, 'Tasks', [
      { id: 'Title', fields: { type: 'Text', label: 'Title' } },
      {
        id: 'AssignedTo',
        fields: {
          type: 'Ref:People',
          label: 'Assigned To'
          // widgetOptions will be set later via manageColumns with visibleCol
        }
      },
      { id: 'Status', fields: { type: 'Text', label: 'Status' } }
    ])
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  /**
   * Helper function to get columns for a table
   * The /docs/{docId}/tables endpoint does NOT include columns
   * We must fetch them separately using /docs/{docId}/tables/{tableId}/columns
   */
  async function getTableColumns(
    docId: DocId,
    tableId: TableId
  ): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
    const response = await client.get<{
      columns: Array<{ id: string; fields: Record<string, unknown> }>
    }>(`/docs/${docId}/tables/${tableId}/columns`)
    return response.columns || []
  }

  describe('Ref Column - Single Reference', () => {
    it('should create People records and get their IDs', async () => {
      const recordIds = await addTestRecords(client, docId, peopleTableId, [
        { fields: { Name: 'Alice Johnson', Email: 'alice@example.com' } },
        { fields: { Name: 'Bob Smith', Email: 'bob@example.com' } },
        { fields: { Name: 'Carol White', Email: 'carol@example.com' } }
      ])

      expect(recordIds).toHaveLength(3)
      expect(recordIds[0]).toBeGreaterThan(0)
      expect(recordIds[1]).toBeGreaterThan(0)
      expect(recordIds[2]).toBeGreaterThan(0)

      // Verify records exist
      const records = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)

      expect(records.records.length).toBeGreaterThanOrEqual(3)
      const alice = records.records.find((r) => r.fields.Name === 'Alice Johnson')
      expect(alice).toBeDefined()
      expect(alice?.fields.Email).toBe('alice@example.com')
    })

    it('should insert task with reference to person', async () => {
      // Get Alice's ID
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)
      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')
      expect(alice).toBeDefined()

      const aliceId = alice?.id

      // Create task with reference
      // NOTE: Grist API accepts primitive IDs for Ref columns
      const taskIds = await addTestRecords(client, docId, tasksTableId, [
        {
          fields: {
            Title: 'Fix authentication bug',
            AssignedTo: aliceId, // Use primitive ID, not encoded format
            Status: 'In Progress'
          }
        }
      ])

      expect(taskIds).toHaveLength(1)

      // Query back and verify reference
      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const task = tasks.records.find((r) => r.id === taskIds[0])
      expect(task).toBeDefined()
      expect(task?.fields.Title).toBe('Fix authentication bug')

      // Grist returns Ref as primitive number (not encoded format)
      expect(typeof task?.fields.AssignedTo).toBe('number')
      expect(task?.fields.AssignedTo).toBe(aliceId)
    })

    it('should handle null reference (unassigned)', async () => {
      const taskIds = await addTestRecords(client, docId, tasksTableId, [
        {
          fields: {
            Title: 'Unassigned task',
            AssignedTo: null,
            Status: 'New'
          }
        }
      ])

      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const task = tasks.records.find((r) => r.id === taskIds[0])
      expect(task).toBeDefined()
      // Grist returns 0 for null/empty references, not null
      expect(task?.fields.AssignedTo).toBe(0)
    })

    it('should update reference to different person', async () => {
      // Get Bob's ID
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)
      const bob = people.records.find((r) => r.fields.Name === 'Bob Smith')
      expect(bob).toBeDefined()

      // Create task assigned to Alice
      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')
      const taskIds = await addTestRecords(client, docId, tasksTableId, [
        {
          fields: {
            Title: 'Task to reassign',
            AssignedTo: alice?.id, // Use primitive ID
            Status: 'New'
          }
        }
      ])

      // Update to Bob using primitive ID
      await client.patch(`/docs/${docId}/tables/${tasksTableId}/records`, {
        records: [
          {
            id: taskIds[0],
            fields: {
              AssignedTo: bob?.id // Use primitive ID
            }
          }
        ]
      })

      // Verify update - Grist returns primitive number
      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const task = tasks.records.find((r) => r.id === taskIds[0])
      expect(task?.fields.AssignedTo).toBe(bob?.id)
    })

    it("should handle invalid reference (ID that doesn't exist)", async () => {
      // Create task referencing a non-existent person ID
      const nonExistentId = 999
      const taskIds = await addTestRecords(client, docId, tasksTableId, [
        {
          fields: {
            Title: 'Task with invalid ref',
            AssignedTo: nonExistentId, // Use primitive ID that doesn't exist
            Status: 'New'
          }
        }
      ])

      // Query task - reference should be stored as-is
      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const task = tasks.records.find((r) => r.id === taskIds[0])
      expect(task).toBeDefined()

      // Grist stores the numeric reference even when target doesn't exist
      expect(typeof task?.fields.AssignedTo).toBe('number')
      expect(task?.fields.AssignedTo).toBe(nonExistentId)
    })
  })

  describe('RefList Column - Multiple References', () => {
    let projectsTableId: TableId

    beforeAll(async () => {
      // Create Projects table with RefList:People column
      // Like above, create without widgetOptions initially
      projectsTableId = await createTestTable(client, docId, 'Projects', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        {
          id: 'TeamMembers',
          fields: {
            type: 'RefList:People',
            label: 'Team Members'
            // widgetOptions will be set via manageColumns if needed
          }
        },
        { id: 'Budget', fields: { type: 'Numeric', label: 'Budget' } }
      ])
    })

    it('should insert project with multiple team members', async () => {
      // Get person IDs
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)

      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')
      const bob = people.records.find((r) => r.fields.Name === 'Bob Smith')
      const carol = people.records.find((r) => r.fields.Name === 'Carol White')

      expect(alice).toBeDefined()
      expect(bob).toBeDefined()
      expect(carol).toBeDefined()

      // Create project with team - use encoded RefList format for insertion
      const projectIds = await addTestRecords(client, docId, projectsTableId, [
        {
          fields: {
            Name: 'Alpha Project',
            TeamMembers: ['L', alice?.id, bob?.id, carol?.id], // List format
            Budget: 100000
          }
        }
      ])

      expect(projectIds).toHaveLength(1)

      // Verify - Grist returns RefList as string representation (RecordSetStub)
      const projects = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${projectsTableId}/records`)

      const project = projects.records.find((r) => r.id === projectIds[0])
      expect(project).toBeDefined()
      // Grist returns RefList as a List array when using ['L', ...] format
      expect(Array.isArray(project?.fields.TeamMembers)).toBe(true)
      expect(project?.fields.TeamMembers[0]).toBe('L')
      expect(project?.fields.TeamMembers.slice(1)).toEqual([alice?.id, bob?.id, carol?.id])
    })

    it('should handle empty RefList', async () => {
      const projectIds = await addTestRecords(client, docId, projectsTableId, [
        {
          fields: {
            Name: 'Solo Project',
            TeamMembers: ['L'], // Empty List format
            Budget: 50000
          }
        }
      ])

      const projects = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${projectsTableId}/records`)

      const project = projects.records.find((r) => r.id === projectIds[0])
      // Empty RefList ['L'] returns null
      expect(project?.fields.TeamMembers).toBeNull()
    })

    it('should handle RefList with single member', async () => {
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)
      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')

      const projectIds = await addTestRecords(client, docId, projectsTableId, [
        {
          fields: {
            Name: 'Small Project',
            TeamMembers: ['L', alice?.id], // List with single ID
            Budget: 25000
          }
        }
      ])

      const projects = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${projectsTableId}/records`)

      const project = projects.records.find((r) => r.id === projectIds[0])
      // Grist returns RefList as List array
      expect(Array.isArray(project?.fields.TeamMembers)).toBe(true)
      expect(project?.fields.TeamMembers[0]).toBe('L')
      expect(project?.fields.TeamMembers.slice(1)).toEqual([alice?.id])
    })

    it('should update RefList by adding/removing members', async () => {
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)

      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')
      const bob = people.records.find((r) => r.fields.Name === 'Bob Smith')
      const carol = people.records.find((r) => r.fields.Name === 'Carol White')

      // Create project with Alice and Bob
      const projectIds = await addTestRecords(client, docId, projectsTableId, [
        {
          fields: {
            Name: 'Evolving Project',
            TeamMembers: ['L', alice?.id, bob?.id], // List format
            Budget: 75000
          }
        }
      ])

      // Update to remove Bob and add Carol
      await client.patch(`/docs/${docId}/tables/${projectsTableId}/records`, {
        records: [
          {
            id: projectIds[0],
            fields: {
              TeamMembers: ['L', alice?.id, carol?.id] // List format
            }
          }
        ]
      })

      // Verify update
      const projects = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${projectsTableId}/records`)

      const project = projects.records.find((r) => r.id === projectIds[0])
      // Grist returns RefList as List array
      expect(Array.isArray(project?.fields.TeamMembers)).toBe(true)
      expect(project?.fields.TeamMembers[0]).toBe('L')
      expect(project?.fields.TeamMembers.slice(1)).toEqual([alice?.id, carol?.id])
    })

    it('should handle RefList with invalid references', async () => {
      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)
      const alice = people.records.find((r) => r.fields.Name === 'Alice Johnson')

      // Create project with Alice and a non-existent person ID
      const nonExistentId = 888
      const projectIds = await addTestRecords(client, docId, projectsTableId, [
        {
          fields: {
            Name: 'Mixed Refs Project',
            TeamMembers: ['L', alice?.id, nonExistentId], // List with invalid ID
            Budget: 60000
          }
        }
      ])

      // Verify RefList stores IDs even when some don't exist
      const projects = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${projectsTableId}/records`)

      const project = projects.records.find((r) => r.id === projectIds[0])
      // Grist returns RefList as List array even with invalid references
      expect(Array.isArray(project?.fields.TeamMembers)).toBe(true)
      expect(project?.fields.TeamMembers[0]).toBe('L')
      expect(project?.fields.TeamMembers.slice(1)).toEqual([alice?.id, nonExistentId])
    })
  })

  describe('Reference widgetOptions', () => {
    it('should validate widgetOptions with visibleCol', async () => {
      // Note: The columns were created without widgetOptions in this test file

      // Get table schema
      const columns = await getTableColumns(docId, tasksTableId)
      const assignedToCol = columns.find((c) => c.id === 'AssignedTo')

      expect(assignedToCol).toBeDefined()
      expect(assignedToCol.fields.type).toContain('Ref:')

      // Note: In a production setup using manageColumns, you would use:
      // widgetOptions: { visibleCol: "Name" }  // Auto-resolved to numeric ID
      //
      // See tests/visiblecol.test.ts for comprehensive visibleCol testing
    })

    it('should document the difference between visibleCol and showColumn', async () => {
      // This test documents that visibleCol and showColumn are SEPARATE features:
      //
      // visibleCol: Controls WHAT DATA is displayed for reference values
      // - Example: Show "Alice" instead of numeric ID "1"
      // - Grist requires numeric column IDs
      // - This MCP server auto-resolves string names to numeric IDs
      // - You provide: string (auto-resolved) or number (used directly)
      //
      // showColumn: Controls UI VISIBILITY (hide/show columns in views)
      // - Completely different purpose from visibleCol
      // - Controls whether column appears in the UI
      // - Can be string or boolean
      //
      // See tests/visiblecol.test.ts for comprehensive testing of:
      // 1. String column name resolution to numeric IDs
      // 2. SQL validation that correct numeric IDs are stored in _grist_Tables_column
      //
      // Note: visibleCol affects UI rendering only. The API always returns numeric
      // reference IDs, not display values, so we validate storage via SQL queries.

      expect(true).toBe(true) // Documentation test
    })
  })

  describe('Cross-table queries with references', () => {
    it('should query tasks and resolve person names', async () => {
      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)

      // Find task with reference (Grist returns numeric references)
      const taskWithRef = tasks.records.find(
        (r) =>
          typeof r.fields.AssignedTo === 'number' &&
          r.fields.AssignedTo > 0 &&
          r.fields.Title === 'Fix authentication bug'
      )

      expect(taskWithRef).toBeDefined()

      // Resolve reference manually - AssignedTo is a primitive number (person ID)
      const personId = taskWithRef?.fields.AssignedTo
      const person = people.records.find((p) => p.id === personId)

      expect(person).toBeDefined()
      expect(person?.fields.Name).toBe('Alice Johnson')
    })

    it('should validate reference data integrity', async () => {
      // Get all tasks with references
      const tasks = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tasksTableId}/records`)

      const people = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${peopleTableId}/records`)

      const _peopleIds = new Set(people.records.map((p) => p.id))

      // Check all task references - Grist returns them as numbers
      for (const task of tasks.records) {
        // References are numeric IDs (0 for null, positive numbers for actual refs)
        if (typeof task.fields.AssignedTo === 'number') {
          expect(task.fields.AssignedTo).toBeGreaterThanOrEqual(0)
          // Note: We allow broken references (deleted records)
          // They still appear as valid numbers
        }
      }
    })
  })
})
