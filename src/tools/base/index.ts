/**
 * Base Tool Classes
 *
 * Abstract base classes for all Grist MCP tools
 * Provides common functionality and eliminates code duplication
 */

export { GristTool, type ToolInput, type ToolOutput } from './GristTool.js'
export {
  PaginatedGristTool,
  type PaginatedResponse,
  type PaginatedToolItem,
  type PaginationMetadata
} from './PaginatedGristTool.js'
