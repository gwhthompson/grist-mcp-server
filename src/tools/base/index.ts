/**
 * Base Tool Classes
 *
 * Abstract base classes for all Grist MCP tools
 * Provides common functionality and eliminates code duplication
 */

export { GristTool, type ToolInput, type ToolOutput } from './GristTool.js'
export {
  PaginatedGristTool,
  type PaginationMetadata,
  type PaginatedResponse,
  type PaginatedToolItem
} from './PaginatedGristTool.js'
