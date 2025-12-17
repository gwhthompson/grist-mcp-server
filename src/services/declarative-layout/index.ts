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
// Schema and type guards
export {
  // Link types
  type BreakdownOfLink,
  type ChildOfLink,
  // Utility functions
  collectExistingSectionIds,
  collectNewPanes,
  // Types
  type DeclarativeChartType,
  DeclarativeChartTypeSchema,
  type DeclarativeWidgetType,
  DeclarativeWidgetTypeSchema,
  type DetailOfLink,
  type ExistingPane,
  ExistingPaneSchema,
  getSectionId,
  getWeight,
  // Link type guards
  isBreakdownOfLink,
  isChildOfLink,
  // Layout type guards
  isColSplit,
  isDetailOfLink,
  isExistingPane,
  isListedInLink,
  isMatchedByLink,
  isNewPane,
  isReferencedByLink,
  isRowSplit,
  isSectionId,
  isSyncedWithLink,
  isWeightedSection,
  type LayoutNode,
  LayoutNodeSchema,
  type Link,
  LinkSchema,
  type LinkTarget,
  LinkTargetSchema,
  type ListedInLink,
  type MatchedByLink,
  type NewPane,
  NewPaneSchema,
  type ReferencedByLink,
  type SyncedWithLink,
  type WidgetId,
  WidgetIdSchema
} from './schema.js'
// Layout transforms
export {
  replacePlaceholders,
  type TransformResult,
  toLayoutSpec,
  validateExistingSections
} from './to-layout-spec.js'
// Widget registry - kept for pending link processing (still needed for link_widgets)
export { type PendingLink, WidgetRegistry } from './widget-registry.js'
