/**
 * Page pattern builders for grist_build_page tool.
 *
 * This module provides a strategy pattern implementation for building
 * different page layouts in Grist.
 *
 * Pattern types:
 * - master_detail: Two linked widgets (master controls detail filtering)
 * - hierarchical: Multi-level drill-down with summary tables
 * - chart_dashboard: Charts with optional selector
 * - form_table: Form for data entry paired with table view
 * - custom: Arbitrary widget arrangements
 */

// Export types
export type {
  PatternContext,
  PatternBuildResult,
  WidgetInfo,
  CreateViewSectionResult
} from './types.js'

// Export base class
export { PatternBuilder } from './pattern-builder.js'

// Pattern builders
export { FormTableBuilder, type FormTableConfig } from './form-table-builder.js'
export { MasterDetailBuilder, type MasterDetailConfig } from './master-detail-builder.js'
export { HierarchicalBuilder, type HierarchicalConfig } from './hierarchical-builder.js'
export { ChartDashboardBuilder, type ChartDashboardConfig } from './chart-dashboard-builder.js'
export { CustomBuilder, type CustomConfig } from './custom-builder.js'
