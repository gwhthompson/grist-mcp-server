/**
 * NextStepsBuilder utility for tool responses.
 *
 * Provides a fluent builder for generating consistent nextSteps hints
 * across all tools.
 */

import type { PaginationMeta } from './pagination.js'

type ToolContext = Record<string, string | number | undefined>

/**
 * Fluent builder for generating nextSteps hints.
 * Ensures consistent formatting across all tools.
 *
 * @example
 * ```typescript
 * const hints = nextSteps()
 *   .addPaginationHint(result, 'workspaces')
 *   .addRelatedTool('grist_get_documents', { workspaceId: ws.id })
 *   .addIf(showHelp, 'Use grist_get_help for more information')
 *   .build()
 * ```
 */
export class NextStepsBuilder {
  private steps: string[] = []

  /**
   * Add pagination hint if there are more results.
   */
  addPaginationHint(meta: PaginationMeta, resourceName = 'items'): this {
    if (meta.hasMore && meta.nextOffset !== null) {
      this.steps.push(`Use offset=${meta.nextOffset} to get more ${resourceName}`)
    }
    return this
  }

  /**
   * Add a related tool suggestion with context.
   * @example builder.addRelatedTool('grist_get_documents', { workspaceId: '123' })
   */
  addRelatedTool(toolName: string, context?: ToolContext): this {
    if (context) {
      const definedEntries = Object.entries(context).filter(([, v]) => v !== undefined)
      if (definedEntries.length > 0) {
        const params = definedEntries.map(([k, v]) => `${k}=${v}`).join(', ')
        this.steps.push(`Use ${toolName} with ${params}`)
        return this
      }
    }
    this.steps.push(`Use ${toolName}`)
    return this
  }

  /**
   * Add suggestion to read data after a write operation.
   */
  addVerifyHint(toolName: string, context?: ToolContext): this {
    const base = `Verify with ${toolName}`
    if (context) {
      const definedEntries = Object.entries(context).filter(([, v]) => v !== undefined)
      if (definedEntries.length > 0) {
        const params = definedEntries.map(([k, v]) => `${k}=${v}`).join(', ')
        this.steps.push(`${base} using ${params}`)
        return this
      }
    }
    this.steps.push(base)
    return this
  }

  /**
   * Add a custom hint.
   */
  add(hint: string): this {
    this.steps.push(hint)
    return this
  }

  /**
   * Add hint conditionally.
   */
  addIf(condition: boolean, hint: string): this {
    if (condition) {
      this.steps.push(hint)
    }
    return this
  }

  /**
   * Add hint conditionally with a factory function.
   * Only calls the factory if condition is true.
   */
  addIfFn(condition: boolean, hintFn: () => string): this {
    if (condition) {
      this.steps.push(hintFn())
    }
    return this
  }

  /**
   * Build the final array. Returns undefined if empty.
   */
  build(): string[] | undefined {
    return this.steps.length > 0 ? [...this.steps] : undefined
  }
}

/**
 * Factory function for cleaner usage.
 */
export function nextSteps(): NextStepsBuilder {
  return new NextStepsBuilder()
}
