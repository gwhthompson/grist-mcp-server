/**
 * Widget registry for tracking local IDs during page/layout creation.
 *
 * When creating a declarative layout, new widgets are defined with optional
 * local IDs (e.g., `"id": "list"`). Other widgets can link to these IDs
 * before the actual section IDs are known.
 *
 * The registry tracks:
 * - Local ID → section ID mappings (populated as widgets are created)
 * - Pending links (to be configured after all widgets exist)
 */

import type { Link } from './schema.js'

export interface PendingLink {
  sectionId: number
  link: Link
  tableId: string // Target widget's table (needed for validation)
}

export class WidgetRegistry {
  /** Maps local ID → section ID */
  private localIdToSectionId = new Map<string, number>()

  /** Maps section ID → local ID (reverse lookup) */
  private sectionIdToLocalId = new Map<number, string>()

  /** Links to configure after all widgets are created */
  private pendingLinks: PendingLink[] = []

  /**
   * Register a newly created widget with an optional local ID.
   *
   * @param sectionId - The real section ID from Grist
   * @param localId - Optional local ID from the layout definition
   * @throws Error if localId is already registered
   */
  register(sectionId: number, localId?: string): void {
    if (localId) {
      if (this.localIdToSectionId.has(localId)) {
        throw new Error(
          `Duplicate local widget ID: "${localId}". Each id must be unique within the layout.`
        )
      }
      this.localIdToSectionId.set(localId, sectionId)
      this.sectionIdToLocalId.set(sectionId, localId)
    }
  }

  /**
   * Resolve a link target (local ID or section ID) to a section ID.
   *
   * @param target - Either a local ID string or numeric section ID
   * @returns The resolved section ID
   * @throws Error if local ID not found
   */
  resolve(target: string | number): number {
    if (typeof target === 'number') {
      return target
    }

    const sectionId = this.localIdToSectionId.get(target)
    if (sectionId === undefined) {
      throw new Error(
        `Widget reference "${target}" not found. ` +
          `Ensure the widget with id="${target}" is defined before being referenced.`
      )
    }
    return sectionId
  }

  /**
   * Check if a local ID is registered.
   */
  hasLocalId(localId: string): boolean {
    return this.localIdToSectionId.has(localId)
  }

  /**
   * Get the local ID for a section ID (if any).
   */
  getLocalId(sectionId: number): string | undefined {
    return this.sectionIdToLocalId.get(sectionId)
  }

  /**
   * Queue a link to be configured after all widgets are created.
   *
   * @param sectionId - The section to configure linking for
   * @param link - The link configuration from the layout
   * @param tableId - The table ID of the target widget
   */
  queueLink(sectionId: number, link: Link, tableId: string): void {
    this.pendingLinks.push({ sectionId, link, tableId })
  }

  /**
   * Get all pending links for configuration.
   */
  getPendingLinks(): readonly PendingLink[] {
    return this.pendingLinks
  }

  /**
   * Clear all pending links (after they've been configured).
   */
  clearPendingLinks(): void {
    this.pendingLinks = []
  }

  /**
   * Get all registered mappings (for debugging/logging).
   */
  getMappings(): Map<string, number> {
    return new Map(this.localIdToSectionId)
  }

  /**
   * Reset the registry (for reuse or testing).
   */
  reset(): void {
    this.localIdToSectionId.clear()
    this.sectionIdToLocalId.clear()
    this.pendingLinks = []
  }
}
