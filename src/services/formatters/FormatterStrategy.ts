import { formatAsMarkdown } from '../formatter.js'

export interface FormatterStrategy<T = unknown> {
  canHandle(format: string): boolean
  format(data: T): string
  getMimeType(): string
}

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

export class FormatterRegistry {
  private strategies: FormatterStrategy[] = [
    new JsonFormatterStrategy(),
    new MarkdownFormatterStrategy(),
    new PlainTextFormatterStrategy()
  ]

  register(strategy: FormatterStrategy): void {
    this.strategies.push(strategy)
  }

  format<T>(data: T, format: string = 'markdown'): string {
    const strategy = this.strategies.find((s) => s.canHandle(format))

    if (!strategy) {
      console.error(`[WARN] Unknown format '${format}', falling back to JSON`)
      return new JsonFormatterStrategy().format(data)
    }

    return strategy.format(data)
  }

  getMimeType(format: string = 'markdown'): string {
    const strategy = this.strategies.find((s) => s.canHandle(format))
    return strategy?.getMimeType() || 'application/json'
  }

  getSupportedFormats(): string[] {
    return ['json', 'markdown', 'md', 'text', 'plain']
  }
}

// NOTE: FormatterRegistry is available for extensible formatting but not instantiated as singleton.
// Create instances as needed for explicit dependency injection.
