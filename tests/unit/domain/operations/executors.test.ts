/**
 * Unit Tests for Operation Executors
 *
 * Tests the generic executor functions:
 * - executeAdd: Create entities with verification
 * - executeUpdate: Update entities with partial verification
 * - executeDelete: Delete entities with gone verification
 * - executeRename: Rename entities with old-gone/new-exists verification
 */

import { describe, expect, it, vi } from 'vitest'
import {
  type AddOperationConfig,
  buildColumnTypeMap,
  type DeleteOperationConfig,
  executeAdd,
  executeDelete,
  executeRename,
  executeUpdate,
  type RenameOperationConfig,
  type UpdateOperationConfig
} from '../../../../src/domain/operations/executors/index.js'
import { VerificationError } from '../../../../src/errors/VerificationError.js'
import type { ToolContext } from '../../../../src/registry/types.js'

// =============================================================================
// Mock Context Factory
// =============================================================================

function createMockContext(): ToolContext {
  return {
    client: {} as ToolContext['client'],
    schemaCache: {} as ToolContext['schemaCache']
  }
}

// =============================================================================
// Test Entity Types
// =============================================================================

interface TestEntity {
  id: number
  name: string
  value: number
}

interface TestInput {
  name: string
  value: number
}

interface TestResult {
  entities: TestEntity[]
  count: number
}

interface TestDeleteInput {
  ids: number[]
}

interface TestDeleteResult {
  deletedIds: number[]
  count: number
}

interface TestRenameInput {
  oldName: string
  newName: string
}

interface TestRenameResult {
  entity: TestEntity
  oldName: string
}

// =============================================================================
// buildColumnTypeMap
// =============================================================================

describe('buildColumnTypeMap', () => {
  it('builds map from column metadata', () => {
    const columns = [
      { id: 'Name', fields: { type: 'Text' } },
      { id: 'Age', fields: { type: 'Int' } },
      { id: 'Balance', fields: { type: 'Numeric' } }
    ]

    const result = buildColumnTypeMap(columns)

    expect(result.get('Name')).toBe('Text')
    expect(result.get('Age')).toBe('Int')
    expect(result.get('Balance')).toBe('Numeric')
  })

  it('handles empty column array', () => {
    const result = buildColumnTypeMap([])
    expect(result.size).toBe(0)
  })

  it('overwrites duplicates with last value', () => {
    const columns = [
      { id: 'Name', fields: { type: 'Text' } },
      { id: 'Name', fields: { type: 'Choice' } }
    ]

    const result = buildColumnTypeMap(columns)
    expect(result.get('Name')).toBe('Choice')
  })
})

// =============================================================================
// executeAdd
// =============================================================================

describe('executeAdd', () => {
  const createAddConfig = (
    overrides: Partial<AddOperationConfig<TestInput, TestEntity, TestResult>> = {}
  ): AddOperationConfig<TestInput, TestEntity, TestResult> => ({
    variant: 'add',
    name: 'addTestEntity',
    entityType: 'TestEntity',
    verifyFields: ['name', 'value'],
    execute: vi.fn().mockResolvedValue([{ id: 1, name: 'Test', value: 100 }]),
    readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Test', value: 100 }]),
    buildEntityId: (input) => `test:${input.name}`,
    buildResult: (entities) => ({ entities, count: entities.length }),
    ...overrides
  })

  it('calls execute and buildResult when verify=false', async () => {
    const config = createAddConfig()
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    const result = await executeAdd(config, ctx, 'docId', input, { verify: false })

    expect(config.execute).toHaveBeenCalledWith(ctx, 'docId', input)
    expect(config.readBack).not.toHaveBeenCalled()
    expect(result.entities).toHaveLength(1)
    expect(result.count).toBe(1)
  })

  it('calls readBack and verifies when verify=true', async () => {
    const config = createAddConfig()
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    const result = await executeAdd(config, ctx, 'docId', input, { verify: true })

    expect(config.execute).toHaveBeenCalled()
    expect(config.readBack).toHaveBeenCalled()
    expect(result.entities).toHaveLength(1)
  })

  it('throws VerificationError when verification fails', async () => {
    const config = createAddConfig({
      readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Test', value: 999 }]) // Different value
    })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    await expect(executeAdd(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('throws VerificationError when entity not found after add', async () => {
    const config = createAddConfig({
      readBack: vi.fn().mockResolvedValue([null]) // Entity not found
    })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    await expect(executeAdd(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('calls afterExecute hook if provided', async () => {
    const afterExecute = vi.fn().mockResolvedValue(undefined)
    const config = createAddConfig({ afterExecute })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    await executeAdd(config, ctx, 'docId', input, { verify: false })

    expect(afterExecute).toHaveBeenCalledWith(ctx, 'docId', input)
  })

  it('calls getColumnTypes when provided', async () => {
    const columnTypes = new Map([['value', 'Numeric']])
    const getColumnTypes = vi.fn().mockResolvedValue(columnTypes)
    const config = createAddConfig({ getColumnTypes })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    await executeAdd(config, ctx, 'docId', input, { verify: true })

    expect(getColumnTypes).toHaveBeenCalledWith(ctx, 'docId', input)
  })

  it('handles single entity (non-array) from execute', async () => {
    const config = createAddConfig({
      execute: vi.fn().mockResolvedValue({ id: 1, name: 'Test', value: 100 }), // Single entity
      readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Test', value: 100 }])
    })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    const result = await executeAdd(config, ctx, 'docId', input)

    expect(result.entities).toHaveLength(1)
  })

  it('handles multiple entities', async () => {
    const entities = [
      { id: 1, name: 'Test1', value: 100 },
      { id: 2, name: 'Test2', value: 200 }
    ]
    const config = createAddConfig({
      execute: vi.fn().mockResolvedValue(entities),
      readBack: vi.fn().mockResolvedValue(entities)
    })
    const ctx = createMockContext()
    const input: TestInput = { name: 'Test', value: 100 }

    const result = await executeAdd(config, ctx, 'docId', input)

    expect(result.entities).toHaveLength(2)
    expect(result.count).toBe(2)
  })
})

// =============================================================================
// executeUpdate
// =============================================================================

describe('executeUpdate', () => {
  interface UpdateInput {
    id: number
    updates: Partial<TestEntity>
  }

  const createUpdateConfig = (
    overrides: Partial<UpdateOperationConfig<UpdateInput, TestEntity, TestResult>> = {}
  ): UpdateOperationConfig<UpdateInput, TestEntity, TestResult> => ({
    variant: 'update',
    name: 'updateTestEntity',
    entityType: 'TestEntity',
    execute: vi.fn().mockResolvedValue([{ id: 1, name: 'Updated', value: 200 }]),
    readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Updated', value: 200 }]),
    getUpdatedFields: (input) => input.updates,
    buildEntityId: (input) => `test:${input.id}`,
    buildResult: (entities) => ({ entities, count: entities.length }),
    ...overrides
  })

  it('verifies only updated fields', async () => {
    const config = createUpdateConfig({
      execute: vi.fn().mockResolvedValue([{ id: 1, name: 'Updated', value: 200 }]),
      readBack: vi
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Updated', value: 200, extra: 'ignored' }])
    })
    const ctx = createMockContext()
    const input: UpdateInput = { id: 1, updates: { name: 'Updated' } }

    // Should pass because we only verify 'name', not 'value' or 'extra'
    const result = await executeUpdate(config, ctx, 'docId', input)
    expect(result.entities).toHaveLength(1)
  })

  it('throws when updated field differs', async () => {
    const config = createUpdateConfig({
      execute: vi.fn().mockResolvedValue([{ id: 1, name: 'Updated', value: 200 }]),
      readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Different', value: 200 }])
    })
    const ctx = createMockContext()
    const input: UpdateInput = { id: 1, updates: { name: 'Updated' } }

    await expect(executeUpdate(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('throws when entity not found after update', async () => {
    const config = createUpdateConfig({
      readBack: vi.fn().mockResolvedValue([null])
    })
    const ctx = createMockContext()
    const input: UpdateInput = { id: 1, updates: { name: 'Updated' } }

    await expect(executeUpdate(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('skips verification when verify=false', async () => {
    const config = createUpdateConfig()
    const ctx = createMockContext()
    const input: UpdateInput = { id: 1, updates: { name: 'Updated' } }

    const result = await executeUpdate(config, ctx, 'docId', input, { verify: false })

    expect(config.readBack).not.toHaveBeenCalled()
    expect(result.entities).toHaveLength(1)
  })
})

// =============================================================================
// executeDelete
// =============================================================================

describe('executeDelete', () => {
  const createDeleteConfig = (
    overrides: Partial<
      DeleteOperationConfig<TestDeleteInput, number, TestDeleteResult, TestEntity>
    > = {}
  ): DeleteOperationConfig<TestDeleteInput, number, TestDeleteResult, TestEntity> => ({
    variant: 'delete',
    name: 'deleteTestEntity',
    entityType: 'TestEntity',
    execute: vi.fn().mockResolvedValue([1, 2]),
    readBack: vi.fn().mockResolvedValue([]), // Empty = all deleted
    buildEntityId: (input) => `test:[${input.ids.join(',')}]`,
    buildResult: (deletedIds) => ({ deletedIds, count: deletedIds.length }),
    ...overrides
  })

  it('verifies entities are gone after delete', async () => {
    const config = createDeleteConfig()
    const ctx = createMockContext()
    const input: TestDeleteInput = { ids: [1, 2] }

    const result = await executeDelete(config, ctx, 'docId', input)

    expect(config.readBack).toHaveBeenCalled()
    expect(result.deletedIds).toEqual([1, 2])
    expect(result.count).toBe(2)
  })

  it('throws when entities still exist', async () => {
    const config = createDeleteConfig({
      readBack: vi.fn().mockResolvedValue([{ id: 1, name: 'Still here', value: 100 }])
    })
    const ctx = createMockContext()
    const input: TestDeleteInput = { ids: [1, 2] }

    await expect(executeDelete(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('skips verification when verify=false', async () => {
    const config = createDeleteConfig()
    const ctx = createMockContext()
    const input: TestDeleteInput = { ids: [1, 2] }

    const result = await executeDelete(config, ctx, 'docId', input, { verify: false })

    expect(config.readBack).not.toHaveBeenCalled()
    expect(result.count).toBe(2)
  })

  it('calls afterExecute hook if provided', async () => {
    const afterExecute = vi.fn().mockResolvedValue(undefined)
    const config = createDeleteConfig({ afterExecute })
    const ctx = createMockContext()
    const input: TestDeleteInput = { ids: [1, 2] }

    await executeDelete(config, ctx, 'docId', input, { verify: false })

    expect(afterExecute).toHaveBeenCalledWith(ctx, 'docId', input)
  })
})

// =============================================================================
// executeRename
// =============================================================================

describe('executeRename', () => {
  const createRenameConfig = (
    overrides: Partial<RenameOperationConfig<TestRenameInput, TestEntity, TestRenameResult>> = {}
  ): RenameOperationConfig<TestRenameInput, TestEntity, TestRenameResult> => ({
    variant: 'rename',
    name: 'renameTestEntity',
    entityType: 'TestEntity',
    execute: vi.fn().mockResolvedValue(undefined),
    readOld: vi.fn().mockResolvedValue(null), // Old should be gone
    readNew: vi.fn().mockResolvedValue({ id: 1, name: 'NewName', value: 100 }), // New should exist
    buildEntityId: (input) => `${input.oldName} → ${input.newName}`,
    buildResult: (entity, input) => ({ entity, oldName: input.oldName }),
    ...overrides
  })

  it('passes when old is gone and new exists', async () => {
    const config = createRenameConfig()
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    const result = await executeRename(config, ctx, 'docId', input)

    expect(result.entity.name).toBe('NewName')
    expect(result.oldName).toBe('OldName')
  })

  it('throws when old still exists', async () => {
    const config = createRenameConfig({
      readOld: vi.fn().mockResolvedValue({ id: 1, name: 'OldName', value: 100 })
    })
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    await expect(executeRename(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('throws when new does not exist', async () => {
    const config = createRenameConfig({
      readNew: vi.fn().mockResolvedValue(null)
    })
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    await expect(executeRename(config, ctx, 'docId', input)).rejects.toThrow(VerificationError)
  })

  it('reads old and new in parallel', async () => {
    const readOld = vi.fn().mockResolvedValue(null)
    const readNew = vi.fn().mockResolvedValue({ id: 1, name: 'NewName', value: 100 })
    const config = createRenameConfig({ readOld, readNew })
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    await executeRename(config, ctx, 'docId', input)

    expect(readOld).toHaveBeenCalled()
    expect(readNew).toHaveBeenCalled()
  })

  it('skips verification but still reads new when verify=false', async () => {
    const readNew = vi.fn().mockResolvedValue({ id: 1, name: 'NewName', value: 100 })
    const readOld = vi.fn().mockResolvedValue({ id: 1, name: 'OldName', value: 100 }) // Would fail verification
    const config = createRenameConfig({ readOld, readNew })
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    const result = await executeRename(config, ctx, 'docId', input, { verify: false })

    // Should still work because verification is skipped
    expect(result.entity.name).toBe('NewName')
    // readOld should not be called when verify=false
    expect(readOld).not.toHaveBeenCalled()
  })

  it('throws Error (not VerificationError) when new entity is null without verification', async () => {
    const config = createRenameConfig({
      readNew: vi.fn().mockResolvedValue(null)
    })
    const ctx = createMockContext()
    const input: TestRenameInput = { oldName: 'OldName', newName: 'NewName' }

    // With verify=false, we still need the new entity for the result
    await expect(executeRename(config, ctx, 'docId', input, { verify: false })).rejects.toThrow(
      'TestEntity not found after renameTestEntity operation'
    )
  })
})
