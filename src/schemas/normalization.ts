/**
 * Input normalization for schema operations.
 *
 * Handles: create_table accepts both `name` and `tableId` for consistency
 * with other operations (rename_table, delete_table, etc. all use tableId).
 *
 * Key insight: z.preprocess() returns ZodEffects, not ZodObject, which breaks
 * discriminatedUnion(). By normalizing at the array level (via jsonSafeArray's
 * normalize option), we keep union members as pure ZodObject instances.
 */

/**
 * Normalize schema operation, converting tableId → name for create_table.
 *
 * @example
 * normalizeSchemaOperation({action: "create_table", tableId: "Tasks"})
 * // → {action: "create_table", name: "Tasks"}
 */
export function normalizeSchemaOperation(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return input
  }

  const obj = input as Record<string, unknown>
  const action = obj.action as string | undefined

  if (action !== 'create_table') {
    return input
  }

  // Convert tableId → name if tableId is present and name is not
  if ('tableId' in obj && !('name' in obj)) {
    const { tableId, ...rest } = obj
    return { ...rest, name: tableId }
  }

  return input
}
