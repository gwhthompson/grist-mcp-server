/**
 * Formatter Strategy Pattern
 *
 * Extensible formatter system using Strategy pattern
 * Allows adding new output formats without modifying existing code
 */

import { formatAsMarkdown } from '../formatter.js'

/**
 * Formatter strategy interface
 */
export interface FormatterStrategy<T = unknown> {
  /**
   * Check if this formatter handles the given format
   */
  canHandle(format: string): boolean

  /**
   * Format data according to this strategy
   */
  format(data: T): string

  /**
   * Get MIME type for this format
   */
  getMimeType(): string
}

/**
 * JSON formatter strategy
 */
export class JsonFormatterStrategy implements FormatterStrategy {
  canHandle(format: string): boolean {
    return format === 'json'
  }

  format<T>(data: T): string {
    return JSON.stringify(data, null, 2)
  }

  getMimeType(): string {
    return 'application/json'
  }
}

/**
 * Markdown formatter strategy
 */
export class MarkdownFormatterStrategy implements FormatterStrategy {
  canHandle(format: string): boolean {
    return format === 'markdown' || format === 'md'
  }

  format<T>(data: T): string {
    return formatAsMarkdown(data)
  }

  getMimeType(): string {
    return 'text/markdown'
  }
}

/**
 * Plain text formatter strategy
 */
export class PlainTextFormatterStrategy implements FormatterStrategy {
  canHandle(format: string): boolean {
    return format === 'text' || format === 'plain'
  }

  format<T>(data: T): string {
    if (typeof data === 'string') {
      return data
    }
    if (data === null || data === undefined) {
      return ''
    }
    return String(data)
  }

  getMimeType(): string {
    return 'text/plain'
  }
}

/**
 * Formatter registry
 * Manages available formatters and selects appropriate one
 */
export class FormatterRegistry {
  private strategies: FormatterStrategy[] = [
    new JsonFormatterStrategy(),
    new MarkdownFormatterStrategy(),
    new PlainTextFormatterStrategy()
  ]

  /**
   * Register a new formatter strategy
   */
  register(strategy: FormatterStrategy): void {
    this.strategies.push(strategy)
  }

  /**
   * Format data using appropriate strategy
   */
  format<T>(data: T, format: string = 'markdown'): string {
    const strategy = this.strategies.find((s) => s.canHandle(format))

    if (!strategy) {
      // Fallback to JSON if unknown format
      console.error(`[WARN] Unknown format '${format}', falling back to JSON`)
      return new JsonFormatterStrategy().format(data)
    }

    return strategy.format(data)
  }

  /**
   * Get MIME type for format
   */
  getMimeType(format: string = 'markdown'): string {
    const strategy = this.strategies.find((s) => s.canHandle(format))
    return strategy?.getMimeType() || 'application/json'
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): string[] {
    return ['json', 'markdown', 'md', 'text', 'plain']
  }
}

/**
 * Global formatter registry instance
 */
export const formatterRegistry = new FormatterRegistry()
