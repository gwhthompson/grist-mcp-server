/**
 * Declarative layout module for Grist pages.
 *
 * Provides a user-friendly declarative format for creating and modifying
 * page layouts with widget arrangement and semantic linking.
 */

// Executor
export {
  type CreatePageResult,
  executeCreatePage,
  executeGetLayout,
  executeSetLayout,
  type GetLayoutResult,
  type SetLayoutResult
} from './executor.js'
export {
  countWidgets,
  extractSectionIds,
  type FromLayoutSpecOptions,
  formatGetLayoutResult,
  fromLayoutSpec,
  fromLayoutSpecWithResolution,
  type GetLayoutResult as FromLayoutResult,
  type WidgetInfo as FromLayoutWidgetInfo
} from './from-layout-spec.js'
// Link resolver
export {
  buildLinkActions,
  type ResolvedLink,
  resolveLink,
  type WidgetInfo as LinkWidgetInfo
} from './link-resolver.js'
// Schema and types
// Type guards
export {
  collectExistingSectionIds,
  collectLocalIds,
  collectNewPanes,
  type DeclarativeChartType,
  DeclarativeChartTypeSchema,
  type DeclarativeWidgetType,
  DeclarativeWidgetTypeSchema,
  type ExistingPane,
  ExistingPaneSchema,
  getSectionId,
  getWeight,
  isColSplit,
  isCustomLink,
  isExistingPane,
  isFilterLink,
  isGroupLink,
  isNewPane,
  isRefsLink,
  isRowSplit,
  isSectionId,
  isSelectLink,
  isSummaryLink,
  isSyncLink,
  isWeightedSection,
  type LayoutNode,
  LayoutNodeSchema,
  type Link,
  LinkSchema,
  type LinkTarget,
  LinkTargetSchema,
  type NewPane,
  NewPaneSchema
} from './schema.js'
// Layout transforms
export {
  replacePlaceholders,
  type TransformResult,
  toLayoutSpec,
  validateExistingSections
} from './to-layout-spec.js'
// Widget registry
export { type PendingLink, WidgetRegistry } from './widget-registry.js'
