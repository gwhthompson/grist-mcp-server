import { z } from 'zod'

/**
 * Metadata stored for each registered Grist entity schema.
 *
 * This metadata enables generic read/write/verify operations
 * by associating Grist-specific information with each schema.
 */
export interface GristEntityMetadata {
  /** REST API endpoint pattern (e.g., '/docs/{docId}/tables/{tableId}/records') */
  endpoint: string

  /** Primary UserAction type for writes (e.g., 'BulkAddRecord', 'AddTable') */
  userAction: string

  /** Fields to verify after write (subset comparison for verification) */
  verifyFields: string[]

  /** Optional: Human-readable entity name for error messages */
  displayName?: string
}

/**
 * Registry for Grist entity metadata.
 *
 * Maps Zod schemas to their Grist-specific metadata, enabling:
 * - Generic read operations (using endpoint)
 * - Generic write operations (using userAction)
 * - Generic verification (using verifyFields)
 *
 * @example
 * ```typescript
 * // Register a schema with metadata
 * gristRegistry.add(RecordSchema, {
 *   endpoint: '/docs/{docId}/tables/{tableId}/records',
 *   userAction: 'BulkAddRecord',
 *   verifyFields: ['fields']
 * })
 *
 * // Retrieve metadata
 * const meta = gristRegistry.get(RecordSchema)
 * ```
 */
export const gristRegistry = z.registry<GristEntityMetadata>()

/**
 * Helper to register a schema with metadata and return it.
 * Enables fluent registration pattern.
 *
 * @example
 * ```typescript
 * export const RecordSchema = registerSchema(
 *   z.object({ ... }),
 *   {
 *     endpoint: '/docs/{docId}/tables/{tableId}/records',
 *     userAction: 'BulkAddRecord',
 *     verifyFields: ['fields']
 *   }
 * )
 * ```
 */
export function registerSchema<T extends z.ZodType>(schema: T, metadata: GristEntityMetadata): T {
  gristRegistry.add(schema, metadata)
  return schema
}

/**
 * Get metadata for a schema, throwing if not registered.
 */
export function getSchemaMetadata<T extends z.ZodType>(schema: T): GristEntityMetadata {
  const metadata = gristRegistry.get(schema)
  if (!metadata) {
    throw new Error(
      `Schema not registered in gristRegistry. ` +
        `Use registerSchema() or gristRegistry.add() to register it.`
    )
  }
  return metadata
}

/**
 * Check if a schema has been registered.
 */
export function isSchemaRegistered<T extends z.ZodType>(schema: T): boolean {
  return gristRegistry.has(schema)
}
