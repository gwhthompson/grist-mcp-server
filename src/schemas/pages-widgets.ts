import { z } from 'zod'
import {
  DocIdSchema,
  PagesPaginationSchema,
  parseJsonString,
  ResponseFormatSchema,
  TableIdSchema
} from './common.js'

/**
 * Schema for grist_get_pages tool
 */
export const GetPagesSchema = z.strictObject({
  docId: DocIdSchema,
  detail_level: z
    .enum(['summary', 'detailed'])
    .default('summary')
    .describe(
      '"summary": Page names, widget types, tables. ' +
        '"detailed": + linking info, chart configs, group-by columns'
    ),
  ...PagesPaginationSchema.shape,
  response_format: ResponseFormatSchema.optional().default('markdown')
})

export type GetPagesInput = z.infer<typeof GetPagesSchema>

export type UserWidgetType = 'grid' | 'card' | 'card_list' | 'chart' | 'form' | 'custom'
export type GristWidgetType = 'record' | 'single' | 'detail' | 'chart' | 'form' | 'custom'

export const UserWidgetTypeSchema = z
  .enum(['grid', 'card', 'card_list', 'chart', 'form', 'custom'])
  .describe(
    'Widget display type: grid (table), card (single record), card_list (multiple cards), chart, form, or custom'
  )

export function toGristWidgetType(userType: UserWidgetType): GristWidgetType {
  const mapping: Record<UserWidgetType, GristWidgetType> = {
    grid: 'record',
    card: 'single',
    card_list: 'detail',
    chart: 'chart',
    form: 'form',
    custom: 'custom'
  }
  return mapping[userType]
}

export const WidgetTypeSchema = UserWidgetTypeSchema

export const LayoutSpecSchema: z.ZodType<{
  type: 'leaf' | 'hsplit' | 'vsplit'
  leaf?: number
  children?: unknown[]
  splitRatio?: number
}> = z.lazy(() =>
  z.discriminatedUnion('type', [
    // Single widget layout
    z.strictObject({
      type: z.literal('leaf'),
      leaf: z.number().int().positive().describe('Widget ID (sectionId)')
    }),

    // Horizontal split layout
    z.strictObject({
      type: z.literal('hsplit'),
      children: z
        .array(LayoutSpecSchema)
        .min(2)
        .max(10)
        .describe('Child layouts (at least 2 required)'),
      splitRatio: z
        .number()
        .min(0.1)
        .max(0.9)
        .default(0.5)
        .describe('Split ratio (0.1-0.9, default: 0.5)')
    }),

    // Vertical split layout
    z.strictObject({
      type: z.literal('vsplit'),
      children: z
        .array(LayoutSpecSchema)
        .min(2)
        .max(10)
        .describe('Child layouts (at least 2 required)'),
      splitRatio: z
        .number()
        .min(0.1)
        .max(0.9)
        .default(0.5)
        .describe('Split ratio (0.1-0.9, default: 0.5)')
    })
  ])
)

export const SortSpecSchema = z.union([
  z
    .array(z.number().int())
    .describe('Array of column IDs: [2] ascending, [-2] descending, [3, -5] multiple'),
  z
    .array(z.string())
    .describe(
      'Array of column names or IDs with optional flags. ' +
        'Use column names: ["Name", "-Price"] or IDs: ["3", "-5"]. ' +
        'Prefix with "-" for descending. ' +
        'Suffix with flags: ["Name:emptyLast", "-Price:naturalSort"]. ' +
        'Valid flags: emptyLast, naturalSort, orderByChoice'
    )
])

export const FilterSpecSchema = z
  .strictObject({
    included: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe('Values to include (whitelist)'),
    excluded: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe('Values to exclude (blacklist)')
  })
  .refine((data) => data.included !== undefined || data.excluded !== undefined, {
    error: 'Filter must specify either included or excluded values'
  })

const WidgetIdentifierSchema = z
  .union([z.string().min(1), z.number().int().positive()])
  .describe('Widget name (string) or numeric section ID')

export const WidgetLinkConfigSchema = z.strictObject({
  source_widget: WidgetIdentifierSchema.describe(
    'Source widget name or ID (the selector/master widget)'
  ),
  target_col: z
    .union([z.string(), z.number(), z.literal(0)])
    .optional()
    .describe('Target column name/ID for link. Use 0 or omit for table-level link (entire record)'),
  source_col: z
    .union([z.string(), z.number(), z.literal(0)])
    .optional()
    .describe('Source column name/ID for link. Use 0 or omit for table-level link (entire record)')
})

const BaseWidgetConfigSchema = z.object({
  table: TableIdSchema.describe('Data table name for this widget'),
  widget_type: WidgetTypeSchema.default('grid').describe(
    'Widget display type (grid, card, card_list, chart, form, custom)'
  ),
  title: z.string().optional().describe('Widget title (defaults to table name)'),
  description: z.string().optional().describe('Widget description')
})

const MasterDetailConfigSchema = z.strictObject({
  pattern: z.literal('master_detail'),
  master: z.strictObject({
    ...BaseWidgetConfigSchema.shape,
    width: z
      .number()
      .int()
      .min(10)
      .max(90)
      .default(50)
      .describe('Master widget width percentage (10-90, default: 50)')
  }),
  detail: z.strictObject({
    ...BaseWidgetConfigSchema.shape,
    link_field: z
      .union([z.string(), z.number()])
      .describe('Reference column in detail table linking to master table')
  }),
  split: z.enum(['horizontal', 'vertical']).default('horizontal').describe('Split direction')
})

const HierarchicalConfigSchema = z.strictObject({
  pattern: z.literal('hierarchical'),
  levels: z
    .array(
      z.strictObject({
        ...BaseWidgetConfigSchema.shape,
        group_by: z.array(z.string()).min(1).describe('Columns to group by for this summary level')
      })
    )
    .min(2)
    .max(5)
    .describe('Summary levels (2-5 levels, each with group_by columns)')
})

const ChartDashboardConfigSchema = z.strictObject({
  pattern: z.literal('chart_dashboard'),
  selector: BaseWidgetConfigSchema.optional().describe(
    'Optional selector widget (table/card list)'
  ),
  charts: z
    .array(
      z.strictObject({
        ...BaseWidgetConfigSchema.shape,
        widget_type: z.literal('chart'),
        chart_type: z
          .enum(['bar', 'pie', 'donut', 'area', 'line', 'scatter', 'kaplan_meier'])
          .optional()
          .describe('Chart type'),
        x_axis: z.string().optional().describe('X-axis column name'),
        y_axis: z.array(z.string()).optional().describe('Y-axis column names (series)'),
        chart_options: z
          .strictObject({
            multiseries: z.boolean().optional(),
            lineConnectGaps: z.boolean().optional(),
            lineMarkers: z.boolean().optional(),
            stacked: z.boolean().optional(),
            errorBars: z.boolean().optional(),
            invertYAxis: z.boolean().optional(),
            logYAxis: z.boolean().optional(),
            orientation: z.enum(['h', 'v']).optional(),
            donutHoleSize: z.number().min(0).max(1).optional(),
            showTotal: z.boolean().optional(),
            textSize: z.number().positive().optional(),
            aggregate: z.string().optional()
          })
          .optional()
          .describe('Chart display options (stored in options column as JSON)')
      })
    )
    .min(1)
    .max(6)
    .describe('Chart widgets (1-6 charts)')
})

const FormTableConfigSchema = z.strictObject({
  pattern: z.literal('form_table'),
  form: z.strictObject({
    ...BaseWidgetConfigSchema.shape,
    widget_type: z.literal('form'),
    fields: z.array(z.string()).optional().describe('Form fields to display (column names)')
  }),
  table: z.strictObject({
    ...BaseWidgetConfigSchema.shape,
    widget_type: z.enum(['grid', 'card_list']).default('grid')
  }),
  split: z.enum(['horizontal', 'vertical']).default('vertical').describe('Split direction')
})

const CustomConfigSchema = z.strictObject({
  pattern: z.literal('custom'),
  widgets: z
    .array(
      z.strictObject({
        ...BaseWidgetConfigSchema.shape,
        link_to: z
          .string()
          .optional()
          .describe('Name of widget to link to (for master-detail relationships)'),
        link_field: z
          .union([z.string(), z.number()])
          .optional()
          .describe('Reference column for linking')
      })
    )
    .min(1)
    .max(10)
    .describe('Widget configurations (1-10 widgets)'),
  layout: LayoutSpecSchema.optional().describe(
    'Custom layout specification. If omitted, widgets are arranged in default grid'
  )
})

const RawPageConfigSchema = z.discriminatedUnion('pattern', [
  MasterDetailConfigSchema,
  HierarchicalConfigSchema,
  ChartDashboardConfigSchema,
  FormTableConfigSchema,
  CustomConfigSchema
])

export const BuildPageSchema = z
  .strictObject({
    docId: DocIdSchema,
    page_name: z
      .string()
      .min(1)
      .max(255)
      .describe('Page name for navigation (e.g., "Sales Dashboard", "Inventory View")'),
    config: z.preprocess(parseJsonString, RawPageConfigSchema),
    response_format: ResponseFormatSchema.optional().default('markdown')
  })
  .superRefine((data, ctx) => {
    if (data.config.pattern === 'custom') {
      const customConfig = data.config
      const widgets = customConfig.widgets

      const widgetTitles = widgets
        .map((w) => w.title || w.table)
        .filter((t): t is string => t !== undefined)

      const duplicates = widgetTitles.filter(
        (title, index) => widgetTitles.indexOf(title) !== index
      )

      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate widget titles found: ${[...new Set(duplicates)].join(', ')}. Each widget must have a unique title for linking`,
          path: ['config', 'widgets']
        })
      }

      widgets.forEach((widget, index) => {
        if (widget.link_to) {
          const linkedWidget = widgets.find((w) => (w.title || w.table) === widget.link_to)
          if (!linkedWidget) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Widget "${widget.title || widget.table}" references non-existent widget "${widget.link_to}" in link_to`,
              path: ['config', 'widgets', index, 'link_to']
            })
          }
        }
      })
    }

    if (data.config.pattern === 'chart_dashboard' && data.config.selector) {
      const selectorTable = data.config.selector.table
      const unmatchedCharts = data.config.charts.filter((chart) => chart.table !== selectorTable)

      if (unmatchedCharts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Chart dashboard pattern: all charts should use the same table as selector ("${selectorTable}"). Charts with different tables: ${unmatchedCharts.map((c) => c.title || c.table).join(', ')}`,
          path: ['config', 'charts']
        })
      }
    }
  })

export type BuildPageInput = z.infer<typeof BuildPageSchema>

const AddWidgetOperationSchema = z.strictObject({
  action: z.literal('add'),
  page_name: z.string().min(1).describe('Page name where widget will be added'),
  table: TableIdSchema.describe('Data table for the new widget'),
  widget_type: WidgetTypeSchema.default('grid').describe(
    'Widget display type (grid, card, card_list, chart, form, custom)'
  ),
  title: z.string().optional().describe('Widget title'),
  description: z.string().optional().describe('Widget description'),
  position: z
    .enum(['right', 'bottom', 'replace'])
    .default('right')
    .describe('Where to add widget relative to existing layout')
})

const ModifyWidgetOperationSchema = z.strictObject({
  action: z.literal('modify'),
  page_name: z.string().min(1).describe('Page name containing the widget'),
  widget: WidgetIdentifierSchema.describe('Widget name or ID to modify'),
  widget_type: WidgetTypeSchema.optional().describe('Change widget type'),
  table: TableIdSchema.optional().describe('Change data source table'),
  title: z.string().optional().describe('Update widget title'),
  description: z.string().optional().describe('Update widget description'),
  visible_fields: z
    .array(z.string())
    .optional()
    .describe('Set visible fields/columns (replaces current visibility)')
})

const LinkWidgetOperationSchema = z.strictObject({
  action: z.literal('link'),
  page_name: z.string().min(1).describe('Page name containing the widgets'),
  target_widget: WidgetIdentifierSchema.describe('Target widget name or ID (detail widget)'),
  link_config: WidgetLinkConfigSchema
})

const SortWidgetOperationSchema = z.strictObject({
  action: z.literal('sort'),
  page_name: z.string().min(1).describe('Page name containing the widget'),
  widget: WidgetIdentifierSchema.describe('Widget name or ID to configure sorting'),
  sort_spec: SortSpecSchema
})

const FilterWidgetOperationSchema = z.strictObject({
  action: z.literal('filter'),
  page_name: z.string().min(1).describe('Page name containing the widget'),
  widget: WidgetIdentifierSchema.describe('Widget name or ID to configure filtering'),
  column: z.string().min(1).describe('Column name to filter'),
  filter_spec: FilterSpecSchema,
  pinned: z
    .boolean()
    .default(false)
    .describe('Pin filter to filter bar (visible in UI, default: false)')
})

const DeleteWidgetOperationSchema = z.strictObject({
  action: z.literal('delete'),
  page_name: z.string().min(1).describe('Page name containing the widget'),
  widget: WidgetIdentifierSchema.describe('Widget name or ID to delete')
})

const RawWidgetOperationSchema = z.discriminatedUnion('action', [
  AddWidgetOperationSchema,
  ModifyWidgetOperationSchema,
  LinkWidgetOperationSchema,
  SortWidgetOperationSchema,
  FilterWidgetOperationSchema,
  DeleteWidgetOperationSchema
])

export const ConfigureWidgetSchema = z
  .strictObject({
    docId: DocIdSchema,
    operations: z
      .array(z.preprocess(parseJsonString, RawWidgetOperationSchema))
      .min(1)
      .max(50)
      .describe('Widget operations to perform (1-50 operations, executed in order)'),
    response_format: ResponseFormatSchema.optional().default('markdown')
  })
  .superRefine((data, ctx) => {
    const deletedWidgets = new Set<string>()

    data.operations.forEach((op, index) => {
      if (op.action === 'delete') {
        const widgetKey = `${op.page_name}:${op.widget}`
        deletedWidgets.add(widgetKey)
      }

      if (op.action !== 'delete' && op.action !== 'add' && 'widget' in op) {
        const widgetKey = `${op.page_name}:${op.widget}`
        if (deletedWidgets.has(widgetKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Cannot ${op.action} widget "${op.widget}" on page "${op.page_name}" - it was deleted in a previous operation`,
            path: ['operations', index]
          })
        }
      }

      if (op.action === 'modify') {
        const hasChange =
          op.widget_type !== undefined ||
          op.table !== undefined ||
          op.title !== undefined ||
          op.description !== undefined ||
          op.visible_fields !== undefined

        if (!hasChange) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Modify operation must specify at least one field to change (widget_type, table, title, description, or visible_fields)`,
            path: ['operations', index]
          })
        }
      }

      if (op.action === 'link') {
        const { source_col, target_col } = op.link_config
        if (source_col !== undefined && target_col !== undefined) {
          const sourceIsTableLevel = source_col === 0
          const targetIsTableLevel = target_col === 0

          if (sourceIsTableLevel !== targetIsTableLevel) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Operation ${index + 1}: Link configuration invalid - both source_col and target_col must be table-level (0) or both must be column-level (non-zero). Cannot mix table and column linking`,
              path: ['operations', index, 'link_config']
            })
          }
        }
      }
    })
  })

export type ConfigureWidgetInput = z.infer<typeof ConfigureWidgetSchema>

const RenamePageOperationSchema = z.strictObject({
  action: z.literal('rename'),
  page_name: z.string().min(1).describe('Current page name'),
  new_name: z.string().min(1).max(255).describe('New page name')
})

const ReorderPageOperationSchema = z.strictObject({
  action: z.literal('reorder'),
  page_name: z.string().min(1).describe('Page name to reorder'),
  position: z.union([
    z.number().int().nonnegative().describe('Absolute position (0-indexed)'),
    z.object({
      before: z.string().min(1).describe('Place before this page')
    }),
    z.object({
      after: z.string().min(1).describe('Place after this page')
    })
  ])
})

const DeletePageOperationSchema = z.strictObject({
  action: z.literal('delete'),
  page_name: z.string().min(1).describe('Page name to delete'),
  delete_data: z
    .boolean()
    .default(false)
    .describe(
      'Delete underlying data tables (default: false, only deletes view). WARNING: Permanent data loss'
    )
})

export const UpdatePageSchema = z
  .strictObject({
    docId: DocIdSchema,
    operations: z
      .array(
        z.discriminatedUnion('action', [
          RenamePageOperationSchema,
          ReorderPageOperationSchema,
          DeletePageOperationSchema
        ])
      )
      .min(1)
      .max(50)
      .describe('Page operations to perform (1-50 operations, executed in order)'),
    response_format: ResponseFormatSchema.optional().default('markdown')
  })
  .superRefine((data, ctx) => {
    const pageNameMap = new Map<string, string>()
    const deletedPages = new Set<string>()
    const createdNames = new Set<string>()

    data.operations.forEach((op, index) => {
      if (op.action === 'rename') {
        const currentName = pageNameMap.get(op.page_name) || op.page_name

        if (deletedPages.has(currentName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Cannot rename page "${op.page_name}" - it was deleted in a previous operation`,
            path: ['operations', index]
          })
        }

        if (createdNames.has(op.new_name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Cannot rename to "${op.new_name}" - this name is already used by another page in this batch`,
            path: ['operations', index, 'new_name']
          })
        }

        pageNameMap.set(op.page_name, op.new_name)
        createdNames.add(op.new_name)
      }

      if (op.action === 'delete') {
        const currentName = pageNameMap.get(op.page_name) || op.page_name
        if (deletedPages.has(currentName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Cannot delete page "${op.page_name}" - it was already deleted in a previous operation`,
            path: ['operations', index]
          })
        }
        deletedPages.add(currentName)
      }

      if (op.action === 'reorder') {
        const currentName = pageNameMap.get(op.page_name) || op.page_name
        if (deletedPages.has(currentName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operation ${index + 1}: Cannot reorder page "${op.page_name}" - it was deleted in a previous operation`,
            path: ['operations', index]
          })
        }
      }
    })
  })

export type UpdatePageInput = z.infer<typeof UpdatePageSchema>
