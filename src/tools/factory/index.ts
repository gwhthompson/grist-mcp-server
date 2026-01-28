/**
 * Tool factory exports.
 *
 * Provides declarative tool definition using factory functions.
 * Each factory is specialized per tool kind for optimal type inference.
 */

export { defineBatchTool, definePaginatedTool, defineStandardTool } from './define-tool.js'

export type {
  BaseToolConfig,
  BatchToolConfig,
  PaginatedResponse,
  PaginatedToolConfig,
  PaginationMetadata,
  StandardToolConfig,
  ToolInputSchema,
  ToolMetadata
} from './types.js'
