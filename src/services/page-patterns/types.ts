/**
 * Types for page pattern builders.
 *
 * Provides the context and result types for pattern-based page creation.
 */

import type { GristClient } from '../grist-client.js'
import type { SchemaCache } from '../schema-cache.js'

/**
 * Context provided to pattern builders during page construction.
 */
export interface PatternContext {
  readonly client: GristClient
  readonly schemaCache: SchemaCache
  readonly docId: string
  readonly pageName: string
  readonly tableRefsMap: ReadonlyMap<string, number>
}

/**
 * Information about a created widget.
 */
export interface WidgetInfo {
  readonly sectionId: number
  readonly tableRef: number
  readonly title: string
  readonly widget_type?: string
  readonly position?: string
  readonly summaryTableId?: string
}

/**
 * Result from building a page pattern.
 */
export interface PatternBuildResult {
  readonly success: true
  readonly pageName: string
  readonly viewId: number
  readonly pattern: string
  readonly description: string
  readonly widgets: ReadonlyArray<WidgetInfo>
}

/**
 * Type for CreateViewSection API results.
 */
export interface CreateViewSectionResult {
  readonly viewRef: number
  readonly sectionRef: number
}
