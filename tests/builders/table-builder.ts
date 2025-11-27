/**
 * Table Builder - Fluent API for Creating Test Tables
 *
 * Provides a readable, chainable interface for creating tables with columns.
 *
 * @example
 * ```typescript
 * const tableId = await new TableBuilder(client, docId, 'Products')
 *   .text('Name', 'Product Name')
 *   .numeric('Price', { decimals: 2, currency: 'USD' })
 *   .choice('Category', ['Electronics', 'Clothing', 'Food'])
 *   .reference('Supplier', 'Suppliers', 'CompanyName')
 *   .create()
 * ```
 */

import type { GristClient } from '../../src/client.js'
import type { DocId, TableId } from '../../src/schemas/ids.js'
import { createTestTable } from '../helpers/grist-api.js'
import { buildChoiceWidgetOptions, buildNumericWidgetOptions } from '../helpers/widget-options.js'

interface ColumnSpec {
  id: string
  type: string
  label?: string
  widgetOptions?: string
  isFormula?: boolean
  formula?: string
}

export class TableBuilder {
  private columns: ColumnSpec[] = []

  constructor(
    private client: GristClient,
    private docId: DocId,
    private tableName: string
  ) {}

  /**
   * Add a text column
   *
   * @example
   * ```typescript
   * builder.text('Name', 'Full Name')
   * ```
   */
  text(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Text',
      label: label || colId
    })
    return this
  }

  /**
   * Add a numeric column with optional formatting
   *
   * @example
   * ```typescript
   * builder.numeric('Price', { decimals: 2, currency: 'USD' })
   * builder.numeric('Quantity') // Plain number
   * ```
   */
  numeric(colId: string, options?: { decimals?: number; currency?: string }): this {
    const widgetOptions = options
      ? buildNumericWidgetOptions({
          numMode: options.currency ? 'currency' : 'decimal',
          decimals: options.decimals ?? 2,
          currency: options.currency
        })
      : undefined

    this.columns.push({
      id: colId,
      type: 'Numeric',
      label: colId,
      widgetOptions
    })
    return this
  }

  /**
   * Add an integer column
   *
   * @example
   * ```typescript
   * builder.int('Count')
   * ```
   */
  int(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Int',
      label: label || colId
    })
    return this
  }

  /**
   * Add a boolean column
   *
   * @example
   * ```typescript
   * builder.bool('IsActive', 'Active')
   * ```
   */
  bool(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Bool',
      label: label || colId
    })
    return this
  }

  /**
   * Add a date column
   *
   * @example
   * ```typescript
   * builder.date('CreatedAt', 'Created Date')
   * ```
   */
  date(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Date',
      label: label || colId
    })
    return this
  }

  /**
   * Add a datetime column
   *
   * @example
   * ```typescript
   * builder.dateTime('UpdatedAt', 'Last Updated')
   * ```
   */
  dateTime(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'DateTime',
      label: label || colId
    })
    return this
  }

  /**
   * Add a choice column (single select)
   *
   * @example
   * ```typescript
   * builder.choice('Status', ['New', 'In Progress', 'Done'])
   * ```
   */
  choice(colId: string, choices: string[], label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Choice',
      label: label || colId,
      widgetOptions: buildChoiceWidgetOptions({ choices })
    })
    return this
  }

  /**
   * Add a choice list column (multi-select)
   *
   * @example
   * ```typescript
   * builder.choiceList('Tags', ['Urgent', 'Feature', 'Bug'])
   * ```
   */
  choiceList(colId: string, choices: string[], label?: string): this {
    this.columns.push({
      id: colId,
      type: 'ChoiceList',
      label: label || colId,
      widgetOptions: buildChoiceWidgetOptions({ choices })
    })
    return this
  }

  /**
   * Add a reference column (foreign key to another table)
   *
   * @example
   * ```typescript
   * builder.reference('Owner', 'Users', 'Email')
   * ```
   */
  reference(colId: string, targetTable: string, visibleCol?: string): this {
    this.columns.push({
      id: colId,
      type: `Ref:${targetTable}`,
      label: colId,
      ...(visibleCol && { widgetOptions: JSON.stringify({ visibleCol }) })
    })
    return this
  }

  /**
   * Add a reference list column (many-to-many)
   *
   * @example
   * ```typescript
   * builder.refList('Assignees', 'Users', 'Email')
   * ```
   */
  refList(colId: string, targetTable: string, visibleCol?: string): this {
    this.columns.push({
      id: colId,
      type: `RefList:${targetTable}`,
      label: colId,
      ...(visibleCol && { widgetOptions: JSON.stringify({ visibleCol }) })
    })
    return this
  }

  /**
   * Add a formula column
   *
   * @example
   * ```typescript
   * builder.formula('FullName', '$FirstName + " " + $LastName', 'Text')
   * ```
   */
  formula(colId: string, formula: string, type: string = 'Any'): this {
    this.columns.push({
      id: colId,
      type,
      label: colId,
      isFormula: true,
      formula
    })
    return this
  }

  /**
   * Add an attachments column
   *
   * @example
   * ```typescript
   * builder.attachments('Documents')
   * ```
   */
  attachments(colId: string, label?: string): this {
    this.columns.push({
      id: colId,
      type: 'Attachments',
      label: label || colId
    })
    return this
  }

  /**
   * Create the table with all configured columns
   *
   * @returns The created table ID
   */
  async create(): Promise<TableId> {
    // Transform ColumnSpec[] to the format expected by createTestTable
    const columnsForGrist = this.columns.map((col) => ({
      id: col.id,
      fields: {
        type: col.type,
        ...(col.label && { label: col.label }),
        ...(col.widgetOptions && { widgetOptions: col.widgetOptions }),
        ...(col.isFormula && { isFormula: col.isFormula }),
        ...(col.formula && { formula: col.formula })
      }
    }))

    const tableId = await createTestTable(this.client, this.docId, this.tableName, columnsForGrist)
    return tableId as TableId
  }
}
