/**
 * Widget registry for tracking local IDs during page/layout creation.
 *
 * When creating a declarative layout, new widgets are defined with optional
 * local IDs (e.g., `"id": "list"`). Other widgets can link to these IDs
 * before the actual section IDs are known.
 *
 * The registry tracks local ID → section ID mappings (populated as widgets are created).
 */

export class WidgetRegistry {
  /** Maps local ID → section ID */
  private localIdToSectionId = new Map<string, number>()

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
}
