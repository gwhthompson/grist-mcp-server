/**
 * Schema registry for Zod global registry.
 *
 * Registers schemas with named $refs for JSON Schema generation.
 */

/**
 * Register all schemas with z.globalRegistry for named JSON Schema $refs.
 * Must be called before any schema generation (tools/list).
 */
export function registerSchemas(): void {
  // This is a placeholder for schema registration.
  // Zod 4 schemas can be registered here for JSON Schema $ref generation.
  // For now, we don't have any schemas that need global registration.
}
