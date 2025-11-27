// Re-export schemas for tool registry
export {
  BuildPageSchema,
  ConfigureWidgetSchema,
  GetPagesSchema,
  UpdatePageSchema
} from '../../schemas/pages-widgets.js'

// Re-export tool functions
export { BUILD_PAGE_DEFINITION, buildPage } from './build-page.js'
export { CONFIGURE_WIDGET_DEFINITION, configureWidget } from './configure-widget.js'
export { GET_PAGES_DEFINITION, getPages } from './get-pages.js'
// Re-export shared utilities (for internal use)
export { fetchWidgetTableMetadata, getFirstSectionId } from './shared.js'
export { UPDATE_PAGE_DEFINITION, updatePage } from './update-page.js'

import type { ToolDefinition } from '../../registry/types.js'
// Aggregate tool definitions
import { BUILD_PAGE_DEFINITION } from './build-page.js'
import { CONFIGURE_WIDGET_DEFINITION } from './configure-widget.js'
import { GET_PAGES_DEFINITION } from './get-pages.js'
import { UPDATE_PAGE_DEFINITION } from './update-page.js'

export const PAGES_TOOLS: ReadonlyArray<ToolDefinition> = [
  GET_PAGES_DEFINITION,
  BUILD_PAGE_DEFINITION,
  CONFIGURE_WIDGET_DEFINITION,
  UPDATE_PAGE_DEFINITION
] as const
