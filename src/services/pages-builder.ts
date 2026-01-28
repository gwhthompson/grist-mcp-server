import { ValidationError } from '../errors/ValidationError.js'
import type { UserWidgetType } from '../schemas/pages-widgets.js'
import { toGristWidgetType as convertWidgetType } from '../schemas/pages-widgets.js'
import type {
  CellValue,
  CreateViewSectionResult,
  LayoutSpec,
  SingleColValues,
  SQLQueryResponse,
  UserAction,
  WidgetType
} from '../types.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import type { GristClient } from './grist-client.js'

export interface WidgetConfig {
  table: string
  widget_type: UserWidgetType // User-facing type (grid, card, card_list)
  title?: string
  description?: string
}

export interface MasterDetailConfig {
  pattern: 'master_detail'
  master: WidgetConfig & { width: number }
  detail: WidgetConfig & { link_field: string | number }
  split: 'horizontal' | 'vertical'
}

export interface HierarchicalConfig {
  pattern: 'hierarchical'
  levels: Array<WidgetConfig & { group_by: string[] }>
}

export interface ChartDashboardConfig {
  pattern: 'chart_dashboard'
  selector?: WidgetConfig
  charts: Array<
    WidgetConfig & {
      chart_type?: string
      x_axis?: string
      y_axis?: string[]
      chart_options?: {
        multiseries?: boolean
        lineConnectGaps?: boolean
        lineMarkers?: boolean
        stacked?: boolean
        errorBars?: boolean
        invertYAxis?: boolean
        logYAxis?: boolean
        orientation?: 'h' | 'v'
        donutHoleSize?: number
        showTotal?: boolean
        textSize?: number
        aggregate?: string
      }
    }
  >
}

export interface FormTableConfig {
  pattern: 'form_table'
  form: WidgetConfig & { fields?: string[] }
  table: WidgetConfig
  split: 'horizontal' | 'vertical'
}

export interface CustomConfig {
  pattern: 'custom'
  widgets: Array<WidgetConfig & { link_to?: string; link_field?: string | number }>
  layout?: LayoutSpec
}

export type PatternConfig =
  | MasterDetailConfig
  | HierarchicalConfig
  | ChartDashboardConfig
  | FormTableConfig
  | CustomConfig

export function buildCreateViewSectionAction(
  tableRef: number,
  viewRef: number,
  sectionType: WidgetType,
  groupbyColRefs: number[] | null,
  tableId: string | null
): UserAction {
  return ['CreateViewSection', tableRef, viewRef, sectionType, groupbyColRefs, tableId]
}

export function buildAddRecordAction(
  tableId: string,
  rowId: number | null,
  colValues: Record<string, unknown>
): UserAction {
  return ['AddRecord', tableId, rowId, colValues as Record<string, CellValue>]
}

export function buildUpdateRecordAction(
  tableId: string,
  rowId: number,
  colValues: Record<string, unknown>
): UserAction {
  return ['UpdateRecord', tableId, rowId, colValues as Record<string, CellValue>]
}

export function serializeLayoutSpec(layoutSpec: LayoutSpec): string {
  return JSON.stringify(layoutSpec)
}

export function serializeSortSpec(sortSpec: Array<number | string>): string {
  return JSON.stringify(sortSpec)
}

export function serializeFilterSpec(filterSpec: {
  included?: unknown[]
  excluded?: unknown[]
}): string {
  return JSON.stringify(filterSpec)
}

export function serializeChartOptions(chartOptions: Record<string, unknown>): string {
  return JSON.stringify(chartOptions)
}

export function buildChartConfigAction(
  sectionId: number,
  chartType: string,
  chartOptions?: Record<string, unknown>
): UserAction {
  const updates: SingleColValues = {
    chartType
  }

  if (chartOptions && Object.keys(chartOptions).length > 0) {
    updates.options = serializeChartOptions(chartOptions)
  }

  return buildUpdateRecordAction('_grist_Views_section', sectionId, updates)
}

export async function buildColumnRefsMap(
  client: GristClient,
  docId: string,
  columnRefs: string[]
): Promise<Map<string, number>> {
  if (columnRefs.length === 0) {
    return new Map()
  }

  const parsed = columnRefs.map((ref) => {
    const [tableName, columnName] = ref.split('.')
    if (!tableName || !columnName) {
      throw new ValidationError(
        'column_ref',
        ref,
        `Invalid column reference format. Expected "TableName.ColumnName", got "${ref}"`
      )
    }
    return { tableName, columnName, ref }
  })

  const placeholders = parsed.map(() => `(t.tableId = ? AND c.colId = ?)`).join(' OR ')
  const args = parsed.flatMap((p) => [p.tableName, p.columnName])

  const query = `
    SELECT t.tableId, c.colId, c.id as colRef
    FROM _grist_Tables_column c
    JOIN _grist_Tables t ON c.parentId = t.id
    WHERE ${placeholders}
  `

  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: query,
    args
  })

  const resultMap = new Map<string, number>()

  for (const record of response.records) {
    const fields = extractFields(record)
    const tableId = fields.tableId as string
    const colId = fields.colId as string
    const colRef = fields.colRef as number

    resultMap.set(`${tableId}.${colId}`, colRef)
  }

  const notFound = columnRefs.filter((ref) => !resultMap.has(ref))
  if (notFound.length > 0) {
    throw new ValidationError(
      'column_refs',
      notFound,
      `Columns not found: ${notFound.join(', ')}. ` +
        `Verify table and column names are correct using grist_get_tables.`
    )
  }

  return resultMap
}

export function buildMasterDetailPattern(
  config: MasterDetailConfig,
  tableRefsMap: Map<string, number>
): UserAction[] {
  const actions: UserAction[] = []

  const masterTableRef = tableRefsMap.get(config.master.table)
  const detailTableRef = tableRefsMap.get(config.detail.table)

  if (!masterTableRef || !detailTableRef) {
    throw new ValidationError(
      'table',
      { master: config.master.table, detail: config.detail.table },
      `Tables not found in document. Master: "${config.master.table}", Detail: "${config.detail.table}"`
    )
  }

  // viewRef=0 creates new view/page, both widgets use 0 to go on same view
  actions.push(
    buildCreateViewSectionAction(
      masterTableRef,
      0,
      convertWidgetType(config.master.widget_type),
      null,
      null
    )
  )

  actions.push(
    buildCreateViewSectionAction(
      detailTableRef,
      0,
      convertWidgetType(config.detail.widget_type),
      null,
      null
    )
  )

  return actions
}

export function buildHierarchicalPattern(
  config: HierarchicalConfig,
  tableRefsMap: Map<string, number>,
  colRefsMap: Map<string, number>
): UserAction[] {
  const actions: UserAction[] = []

  for (const level of config.levels) {
    const tableRef = tableRefsMap.get(level.table)
    if (!tableRef) {
      throw new ValidationError(
        'table',
        level.table,
        `Table "${level.table}" not found in document`
      )
    }

    const groupbyColRefs = level.group_by.map((colName) => {
      const colKey = `${level.table}.${colName}`
      const colRef = colRefsMap.get(colKey)
      if (!colRef) {
        throw new ValidationError(
          'group_by',
          colName,
          `Column "${colName}" not found in table "${level.table}"`
        )
      }
      return colRef
    })

    const viewRef = 0

    actions.push(
      buildCreateViewSectionAction(
        tableRef,
        viewRef,
        convertWidgetType(level.widget_type),
        groupbyColRefs,
        null
      )
    )
  }

  return actions
}

export function buildChartDashboardPattern(
  config: ChartDashboardConfig,
  tableRefsMap: Map<string, number>
): UserAction[] {
  const actions: UserAction[] = []

  if (config.selector) {
    const tableRef = tableRefsMap.get(config.selector.table)
    if (!tableRef) {
      throw new ValidationError(
        'table',
        config.selector.table,
        `Selector table "${config.selector.table}" not found`
      )
    }

    actions.push(
      buildCreateViewSectionAction(
        tableRef,
        0,
        convertWidgetType(config.selector.widget_type),
        null,
        null
      )
    )
  }

  for (const chart of config.charts) {
    const tableRef = tableRefsMap.get(chart.table)
    if (!tableRef) {
      throw new ValidationError('table', chart.table, `Chart table "${chart.table}" not found`)
    }

    actions.push(buildCreateViewSectionAction(tableRef, 0, 'chart', null, null))
  }

  return actions
}

export function buildFormTablePattern(
  config: FormTableConfig,
  tableRefsMap: Map<string, number>
): UserAction[] {
  const actions: UserAction[] = []

  const tableRef = tableRefsMap.get(config.form.table)
  if (!tableRef) {
    throw new ValidationError('table', config.form.table, `Table "${config.form.table}" not found`)
  }

  actions.push(buildCreateViewSectionAction(tableRef, 0, 'form', null, null))

  actions.push(
    buildCreateViewSectionAction(
      tableRef,
      0,
      convertWidgetType(config.table.widget_type),
      null,
      null
    )
  )

  return actions
}

export function buildCustomPattern(
  config: CustomConfig,
  tableRefsMap: Map<string, number>
): UserAction[] {
  const actions: UserAction[] = []

  for (const widget of config.widgets) {
    const tableRef = tableRefsMap.get(widget.table)
    if (!tableRef) {
      throw new ValidationError('table', widget.table, `Table "${widget.table}" not found`)
    }

    actions.push(
      buildCreateViewSectionAction(tableRef, 0, convertWidgetType(widget.widget_type), null, null)
    )
  }

  return actions
}

export function buildWidgetLinkActionWithIndex(
  targetResultIndex: number,
  sourceResultIndex: number,
  sourceColRef: number,
  targetColRef: number
): UserAction {
  const updates: Record<string, number> = {
    linkSrcSectionRef: sourceResultIndex,
    linkSrcColRef: sourceColRef,
    linkTargetColRef: targetColRef
  }
  return buildUpdateRecordAction('_grist_Views_section', targetResultIndex, updates)
}

export function buildWidgetLinkAction(
  targetSectionId: number,
  sourceSectionId: number,
  sourceColRef: number,
  targetColRef: number
): UserAction {
  if (
    typeof sourceColRef !== 'number' ||
    sourceColRef === null ||
    sourceColRef === undefined ||
    Number.isNaN(sourceColRef)
  ) {
    throw new ValidationError(
      'sourceColRef',
      sourceColRef,
      `sourceColRef must be a valid number, got ${typeof sourceColRef}: ${sourceColRef}. ` +
        `This usually indicates a column resolution failure where the source column could not be found.`
    )
  }

  if (
    typeof targetColRef !== 'number' ||
    targetColRef === null ||
    targetColRef === undefined ||
    Number.isNaN(targetColRef)
  ) {
    throw new ValidationError(
      'targetColRef',
      targetColRef,
      `targetColRef must be a valid number, got ${typeof targetColRef}: ${targetColRef}. ` +
        `This usually indicates a column resolution failure where the target column could not be found.`
    )
  }

  return buildUpdateRecordAction('_grist_Views_section', targetSectionId, {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: sourceColRef,
    linkTargetColRef: targetColRef
  })
}

export function buildWidgetSortAction(
  sectionId: number,
  sortSpec: Array<number | string>
): UserAction {
  return buildUpdateRecordAction('_grist_Views_section', sectionId, {
    sortColRefs: serializeSortSpec(sortSpec)
  })
}

export function buildWidgetFilterAction(
  sectionId: number,
  colRef: number,
  filterSpec: { included?: unknown[]; excluded?: unknown[] },
  pinned: boolean
): UserAction {
  return buildAddRecordAction('_grist_Filters', null, {
    viewSectionRef: sectionId,
    colRef,
    filter: serializeFilterSpec(filterSpec),
    pinned
  })
}

export function buildViewNameAndLayoutAction(
  viewResultIndex: number,
  name: string,
  layoutSpec: LayoutSpec
): UserAction {
  return buildUpdateRecordAction('_grist_Views', viewResultIndex, {
    name,
    layoutSpec: serializeLayoutSpec(layoutSpec)
  })
}

export function buildUpdateLayoutAction(viewId: number, layoutSpec: LayoutSpec): UserAction {
  return buildUpdateRecordAction('_grist_Views', viewId, {
    layoutSpec: serializeLayoutSpec(layoutSpec)
  })
}

export function buildAddPageAction(viewRef: number, pagePos: number): UserAction {
  return buildAddRecordAction('_grist_Pages', null, {
    viewRef,
    indentation: 0,
    pagePos
  })
}

export function buildRenamePageAction(viewId: number, newName: string): UserAction {
  return buildUpdateRecordAction('_grist_Views', viewId, {
    name: newName
  })
}

export function buildDeletePageAction(viewId: number): UserAction {
  return ['BulkRemoveRecord', '_grist_Views', [viewId]]
}

export function processCreateViewSectionResults(results: unknown[]): CreateViewSectionResult[] {
  return results
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      tableRef: (r.tableRef as number) || 0,
      viewRef: (r.viewRef as number) || 0,
      sectionRef: (r.sectionRef as number) || 0,
      fieldRefs: (r.fieldRefs as number[]) || []
    }))
}

export function buildLeafLayout(sectionId: number): LayoutSpec {
  return {
    type: 'leaf',
    leaf: sectionId
  }
}

export function buildHorizontalSplitLayout(
  leftSectionId: number,
  rightSectionId: number,
  splitRatio: number = 0.5
): LayoutSpec {
  return {
    type: 'hsplit',
    children: [buildLeafLayout(leftSectionId), buildLeafLayout(rightSectionId)],
    splitRatio
  }
}

export function buildVerticalSplitLayout(
  topSectionId: number,
  bottomSectionId: number,
  splitRatio: number = 0.5
): LayoutSpec {
  return {
    type: 'vsplit',
    children: [buildLeafLayout(topSectionId), buildLeafLayout(bottomSectionId)],
    splitRatio
  }
}

// =============================================================================
// Chart Axes Configuration Helpers
// =============================================================================

/** Fetch column ID to colRef mapping for a table */
async function fetchColumnMappings(
  client: GristClient,
  docId: string,
  tableId: string
): Promise<Map<string, number>> {
  const resp = await client.post<SQLQueryResponse>(
    `/docs/${docId}/sql`,
    {
      sql: `SELECT c.id as colRef, c.colId
            FROM _grist_Tables_column c
            JOIN _grist_Tables t ON c.parentId = t.id
            WHERE t.tableId = ?`,
      args: [tableId]
    },
    {}
  )

  const colIdToColRef = new Map<string, number>()
  for (const record of resp.records) {
    const fields = extractFields(record)
    colIdToColRef.set(fields.colId as string, fields.colRef as number)
  }
  return colIdToColRef
}

/** Fetch existing section fields (colRef -> fieldId) */
async function fetchSectionFields(
  client: GristClient,
  docId: string,
  sectionRef: number
): Promise<Map<number, number>> {
  const resp = await client.post<SQLQueryResponse>(
    `/docs/${docId}/sql`,
    {
      sql: `SELECT f.id as fieldId, f.colRef
            FROM _grist_Views_section_field f
            WHERE f.parentId = ?`,
      args: [sectionRef]
    },
    {}
  )

  const existingFields = new Map<number, number>()
  for (const record of resp.records) {
    const fields = extractFields(record)
    existingFields.set(fields.colRef as number, fields.fieldId as number)
  }
  return existingFields
}

/** Resolve column IDs to colRefs with validation */
function resolveAxisColumns(
  xAxis: string | undefined,
  yAxis: string[] | undefined,
  colIdToColRef: Map<string, number>,
  tableId: string
): number[] {
  const desiredColRefs: number[] = []

  const resolveColumn = (colId: string): number => {
    const colRef = colIdToColRef.get(colId)
    if (colRef === undefined) {
      throw new ValidationError(
        'axis_column',
        colId,
        `Column "${colId}" not found in table "${tableId}". Verify column name.`
      )
    }
    return colRef
  }

  if (xAxis) {
    desiredColRefs.push(resolveColumn(xAxis))
  }
  for (const col of yAxis || []) {
    desiredColRefs.push(resolveColumn(col))
  }

  return desiredColRefs
}

/** Build field actions (remove, update, add) based on desired vs existing fields */
function buildChartFieldActions(
  desiredColRefs: number[],
  existingFields: Map<number, number>,
  sectionRef: number
): UserAction[] {
  const actions: UserAction[] = []
  const desiredColRefSet = new Set(desiredColRefs)

  // Remove unwanted fields
  const fieldIdsToRemove = [...existingFields.entries()]
    .filter(([colRef]) => !desiredColRefSet.has(colRef))
    .map(([, fieldId]) => fieldId)

  if (fieldIdsToRemove.length > 0) {
    actions.push(['BulkRemoveRecord', '_grist_Views_section_field', fieldIdsToRemove])
  }

  // Categorize fields to add vs update
  const fieldsToAdd: { colRef: number; parentPos: number }[] = []
  const fieldsToUpdate: { fieldId: number; parentPos: number }[] = []

  for (let i = 0; i < desiredColRefs.length; i++) {
    const colRef = desiredColRefs[i] as number
    const fieldId = existingFields.get(colRef)
    if (fieldId !== undefined) {
      fieldsToUpdate.push({ fieldId, parentPos: i + 1 })
    } else {
      fieldsToAdd.push({ colRef, parentPos: i + 1 })
    }
  }

  // Bulk update positions
  if (fieldsToUpdate.length > 0) {
    actions.push([
      'BulkUpdateRecord',
      '_grist_Views_section_field',
      fieldsToUpdate.map((f) => f.fieldId),
      { parentPos: fieldsToUpdate.map((f) => f.parentPos) }
    ])
  }

  // Bulk add new fields
  if (fieldsToAdd.length > 0) {
    actions.push([
      'BulkAddRecord',
      '_grist_Views_section_field',
      fieldsToAdd.map(() => null),
      {
        parentId: fieldsToAdd.map(() => sectionRef),
        colRef: fieldsToAdd.map((f) => f.colRef),
        parentPos: fieldsToAdd.map((f) => f.parentPos)
      }
    ])
  }

  return actions
}

/** Configures chart axes by setting exactly the specified columns as chart fields. */
export async function configureChartAxes(
  client: GristClient,
  docId: string,
  sectionRef: number,
  tableId: string,
  xAxis?: string,
  yAxis?: string[]
): Promise<UserAction[]> {
  if (!xAxis && (!yAxis || yAxis.length === 0)) {
    return []
  }

  const [colIdToColRef, existingFields] = await Promise.all([
    fetchColumnMappings(client, docId, tableId),
    fetchSectionFields(client, docId, sectionRef)
  ])

  const desiredColRefs = resolveAxisColumns(xAxis, yAxis, colIdToColRef, tableId)

  return buildChartFieldActions(desiredColRefs, existingFields, sectionRef)
}
