import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../../src/errors/ValidationError.js'
import type { GristClient } from '../../../src/services/grist-client.js'
import type {
  ChartDashboardConfig,
  CustomConfig,
  FormTableConfig,
  HierarchicalConfig,
  MasterDetailConfig
} from '../../../src/services/pages-builder.js'
import {
  buildAddPageAction,
  buildAddRecordAction,
  buildChartConfigAction,
  buildChartDashboardPattern,
  buildColumnRefsMap,
  buildCreateViewSectionAction,
  buildCustomPattern,
  buildDeletePageAction,
  buildFormTablePattern,
  buildHierarchicalPattern,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildMasterDetailPattern,
  buildRenamePageAction,
  buildUpdateLayoutAction,
  buildUpdateRecordAction,
  buildVerticalSplitLayout,
  buildViewNameAndLayoutAction,
  buildWidgetFilterAction,
  buildWidgetLinkAction,
  buildWidgetLinkActionWithIndex,
  buildWidgetSortAction,
  configureChartAxes,
  processCreateViewSectionResults,
  serializeChartOptions,
  serializeFilterSpec,
  serializeLayoutSpec,
  serializeSortSpec
} from '../../../src/services/pages-builder.js'
import type { CreateViewSectionResult, LayoutSpec } from '../../../src/types.js'

describe('pages-builder', () => {
  let mockClient: {
    post: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockClient = {
      post: vi.fn()
    }
  })

  describe('buildCreateViewSectionAction', () => {
    it('builds action with all parameters', () => {
      const action = buildCreateViewSectionAction(5, 10, 'record', [1, 2], 'Table1')

      expect(action).toEqual(['CreateViewSection', 5, 10, 'record', [1, 2], 'Table1'])
    })

    it('builds action with null groupby and tableId', () => {
      const action = buildCreateViewSectionAction(5, 10, 'chart', null, null)

      expect(action).toEqual(['CreateViewSection', 5, 10, 'chart', null, null])
    })

    it('builds action with viewRef=0 for new page', () => {
      const action = buildCreateViewSectionAction(5, 0, 'record', null, null)

      expect(action[2]).toBe(0)
    })
  })

  describe('buildAddRecordAction', () => {
    it('builds AddRecord action with rowId', () => {
      const action = buildAddRecordAction('Table1', 5, { name: 'Test', count: 10 })

      expect(action).toEqual(['AddRecord', 'Table1', 5, { name: 'Test', count: 10 }])
    })

    it('builds AddRecord action with null rowId', () => {
      const action = buildAddRecordAction('Table1', null, { name: 'Test' })

      expect(action).toEqual(['AddRecord', 'Table1', null, { name: 'Test' }])
    })

    it('handles empty colValues', () => {
      const action = buildAddRecordAction('Table1', null, {})

      expect(action).toEqual(['AddRecord', 'Table1', null, {}])
    })
  })

  describe('buildUpdateRecordAction', () => {
    it('builds UpdateRecord action', () => {
      const action = buildUpdateRecordAction('_grist_Views', 1, { name: 'New Name' })

      expect(action).toEqual(['UpdateRecord', '_grist_Views', 1, { name: 'New Name' }])
    })

    it('handles multiple field updates', () => {
      const action = buildUpdateRecordAction('_grist_Views_section', 5, {
        title: 'Widget Title',
        description: 'Widget Description',
        borderWidth: 2
      })

      expect(action[3]).toEqual({
        title: 'Widget Title',
        description: 'Widget Description',
        borderWidth: 2
      })
    })
  })

  describe('serializeLayoutSpec', () => {
    it('serializes leaf layout', () => {
      const layout: LayoutSpec = { type: 'leaf', leaf: 5 }
      const result = serializeLayoutSpec(layout)

      expect(result).toBe('{"type":"leaf","leaf":5}')
    })

    it('serializes horizontal split layout', () => {
      const layout: LayoutSpec = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.6
      }
      const result = serializeLayoutSpec(layout)

      expect(JSON.parse(result)).toEqual(layout)
    })

    it('serializes vertical split layout', () => {
      const layout: LayoutSpec = {
        type: 'vsplit',
        children: [
          { type: 'leaf', leaf: 3 },
          { type: 'leaf', leaf: 4 }
        ],
        splitRatio: 0.4
      }
      const result = serializeLayoutSpec(layout)

      expect(JSON.parse(result)).toEqual(layout)
    })

    it('serializes nested layouts', () => {
      const layout: LayoutSpec = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          {
            type: 'vsplit',
            children: [
              { type: 'leaf', leaf: 2 },
              { type: 'leaf', leaf: 3 }
            ],
            splitRatio: 0.5
          }
        ],
        splitRatio: 0.3
      }
      const result = serializeLayoutSpec(layout)

      expect(JSON.parse(result)).toEqual(layout)
    })
  })

  describe('serializeSortSpec', () => {
    it('serializes numeric sort spec', () => {
      const result = serializeSortSpec([1, -2, 3])

      expect(result).toBe('[1,-2,3]')
    })

    it('serializes string sort spec', () => {
      const result = serializeSortSpec(['Name', '-Price'])

      expect(result).toBe('["Name","-Price"]')
    })

    it('serializes empty sort spec', () => {
      const result = serializeSortSpec([])

      expect(result).toBe('[]')
    })
  })

  describe('serializeFilterSpec', () => {
    it('serializes included filter', () => {
      const result = serializeFilterSpec({ included: ['A', 'B', 'C'] })

      expect(JSON.parse(result)).toEqual({ included: ['A', 'B', 'C'] })
    })

    it('serializes excluded filter', () => {
      const result = serializeFilterSpec({ excluded: [1, 2, 3] })

      expect(JSON.parse(result)).toEqual({ excluded: [1, 2, 3] })
    })

    it('serializes mixed value types', () => {
      const result = serializeFilterSpec({ included: ['text', 123, true, null] })

      expect(JSON.parse(result)).toEqual({ included: ['text', 123, true, null] })
    })

    it('handles empty included array', () => {
      const result = serializeFilterSpec({ included: [] })

      expect(JSON.parse(result)).toEqual({ included: [] })
    })
  })

  describe('serializeChartOptions', () => {
    it('serializes chart options', () => {
      const options = {
        multiseries: true,
        stacked: false,
        lineMarkers: true,
        donutHoleSize: 0.5
      }
      const result = serializeChartOptions(options)

      expect(JSON.parse(result)).toEqual(options)
    })

    it('handles empty options', () => {
      const result = serializeChartOptions({})

      expect(result).toBe('{}')
    })

    it('handles complex nested options', () => {
      const options = {
        multiseries: true,
        orientation: 'h',
        textSize: 14,
        aggregate: 'sum'
      }
      const result = serializeChartOptions(options)

      expect(JSON.parse(result)).toEqual(options)
    })
  })

  describe('buildChartConfigAction', () => {
    it('builds action with chartType only', () => {
      const action = buildChartConfigAction(5, 'bar')

      expect(action).toEqual(['UpdateRecord', '_grist_Views_section', 5, { chartType: 'bar' }])
    })

    it('builds action with chartType and options', () => {
      const action = buildChartConfigAction(5, 'line', { multiseries: true, stacked: false })

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views_section')
      expect(action[2]).toBe(5)
      const updates = action[3] as Record<string, unknown>
      expect(updates.chartType).toBe('line')
      expect(typeof updates.options).toBe('string')
      expect(JSON.parse(updates.options as string)).toEqual({ multiseries: true, stacked: false })
    })

    it('omits options when empty', () => {
      const action = buildChartConfigAction(5, 'pie', {})

      expect(action).toEqual(['UpdateRecord', '_grist_Views_section', 5, { chartType: 'pie' }])
    })

    it('includes options when provided', () => {
      const action = buildChartConfigAction(5, 'donut', { donutHoleSize: 0.6, showTotal: true })

      const updates = action[3] as Record<string, unknown>
      expect(updates.options).toBeDefined()
      expect(JSON.parse(updates.options as string)).toEqual({
        donutHoleSize: 0.6,
        showTotal: true
      })
    })
  })

  describe('buildColumnRefsMap', () => {
    it('returns empty map for empty array', async () => {
      const result = await buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [])

      expect(result).toEqual(new Map())
      expect(mockClient.post).not.toHaveBeenCalled()
    })

    it('resolves single column reference', async () => {
      mockClient.post.mockResolvedValue({
        records: [
          {
            tableId: 'Users',
            colId: 'Name',
            colRef: 10
          }
        ]
      })

      const result = await buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
        'Users.Name'
      ])

      expect(result.get('Users.Name')).toBe(10)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/docId/sql', {
        sql: expect.stringContaining('FROM _grist_Tables_column'),
        args: ['Users', 'Name']
      })
    })

    it('resolves multiple column references', async () => {
      mockClient.post.mockResolvedValue({
        records: [
          { tableId: 'Users', colId: 'Name', colRef: 10 },
          { tableId: 'Users', colId: 'Email', colRef: 11 },
          { tableId: 'Products', colId: 'Price', colRef: 20 }
        ]
      })

      const result = await buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
        'Users.Name',
        'Users.Email',
        'Products.Price'
      ])

      expect(result.get('Users.Name')).toBe(10)
      expect(result.get('Users.Email')).toBe(11)
      expect(result.get('Products.Price')).toBe(20)
    })

    it('handles nested fields structure', async () => {
      mockClient.post.mockResolvedValue({
        records: [
          {
            fields: {
              tableId: 'Users',
              colId: 'Name',
              colRef: 10
            }
          }
        ]
      })

      const result = await buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
        'Users.Name'
      ])

      expect(result.get('Users.Name')).toBe(10)
    })

    it('throws ValidationError for invalid format', async () => {
      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', ['InvalidFormat'])
      ).rejects.toThrow(ValidationError)

      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', ['InvalidFormat'])
      ).rejects.toThrow('Invalid column reference format')
    })

    it('throws ValidationError for missing dot separator', async () => {
      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', ['TableName'])
      ).rejects.toThrow('Expected "TableName.ColumnName"')
    })

    it('throws ValidationError for missing column name', async () => {
      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', ['Table.'])
      ).rejects.toThrow(ValidationError)
    })

    it('throws ValidationError for columns not found', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ tableId: 'Users', colId: 'Name', colRef: 10 }]
      })

      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
          'Users.Name',
          'Users.Missing'
        ])
      ).rejects.toThrow(ValidationError)

      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
          'Users.Name',
          'Users.Missing'
        ])
      ).rejects.toThrow('Columns not found: Users.Missing')
    })

    it('throws ValidationError for multiple missing columns', async () => {
      mockClient.post.mockResolvedValue({
        records: []
      })

      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
          'Users.Name',
          'Users.Email',
          'Products.Price'
        ])
      ).rejects.toThrow('Users.Name, Users.Email, Products.Price')
    })

    it('builds correct SQL query with multiple columns', async () => {
      mockClient.post.mockResolvedValue({ records: [] })

      await expect(
        buildColumnRefsMap(mockClient as unknown as GristClient, 'docId', [
          'Users.Name',
          'Products.Price'
        ])
      ).rejects.toThrow(ValidationError)

      expect(mockClient.post).toHaveBeenCalledWith('/docs/docId/sql', {
        sql: expect.stringContaining('(t.tableId = ? AND c.colId = ?) OR'),
        args: ['Users', 'Name', 'Products', 'Price']
      })
    })
  })

  describe('buildMasterDetailPattern', () => {
    it('builds actions for master-detail pattern', () => {
      const config: MasterDetailConfig = {
        pattern: 'master_detail',
        master: {
          table: 'Users',
          widget_type: 'grid',
          width: 40
        },
        detail: {
          table: 'Orders',
          widget_type: 'card_list',
          link_field: 'user_id'
        },
        split: 'horizontal'
      }

      const tableRefsMap = new Map([
        ['Users', 5],
        ['Orders', 10]
      ])

      const actions = buildMasterDetailPattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'record', null, null])
      expect(actions[1]).toEqual(['CreateViewSection', 10, 0, 'detail', null, null])
    })

    it('throws ValidationError when master table not found', () => {
      const config: MasterDetailConfig = {
        pattern: 'master_detail',
        master: { table: 'Missing', widget_type: 'grid', width: 50 },
        detail: { table: 'Orders', widget_type: 'card_list', link_field: 'user_id' },
        split: 'horizontal'
      }

      const tableRefsMap = new Map([['Orders', 10]])

      expect(() => buildMasterDetailPattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildMasterDetailPattern(config, tableRefsMap)).toThrow('Tables not found')
    })

    it('throws ValidationError when detail table not found', () => {
      const config: MasterDetailConfig = {
        pattern: 'master_detail',
        master: { table: 'Users', widget_type: 'grid', width: 50 },
        detail: { table: 'Missing', widget_type: 'card_list', link_field: 'user_id' },
        split: 'horizontal'
      }

      const tableRefsMap = new Map([['Users', 5]])

      expect(() => buildMasterDetailPattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildMasterDetailPattern(config, tableRefsMap)).toThrow('Missing')
    })

    it('uses viewRef=0 to create widgets on same page', () => {
      const config: MasterDetailConfig = {
        pattern: 'master_detail',
        master: { table: 'Users', widget_type: 'card', width: 30 },
        detail: { table: 'Orders', widget_type: 'grid', link_field: 'user_id' },
        split: 'vertical'
      }

      const tableRefsMap = new Map([
        ['Users', 5],
        ['Orders', 10]
      ])

      const actions = buildMasterDetailPattern(config, tableRefsMap)

      expect(actions[0][2]).toBe(0) // viewRef for master
      expect(actions[1][2]).toBe(0) // viewRef for detail
    })

    it('converts widget types correctly', () => {
      const config: MasterDetailConfig = {
        pattern: 'master_detail',
        master: { table: 'Users', widget_type: 'card', width: 50 },
        detail: { table: 'Orders', widget_type: 'grid', link_field: 'user_id' },
        split: 'horizontal'
      }

      const tableRefsMap = new Map([
        ['Users', 5],
        ['Orders', 10]
      ])

      const actions = buildMasterDetailPattern(config, tableRefsMap)

      expect(actions[0][3]).toBe('single') // card -> single
      expect(actions[1][3]).toBe('record') // grid -> record
    })
  })

  describe('buildHierarchicalPattern', () => {
    it('builds actions for hierarchical pattern', () => {
      const config: HierarchicalConfig = {
        pattern: 'hierarchical',
        levels: [
          { table: 'Sales', widget_type: 'grid', group_by: ['Region'] },
          { table: 'Sales', widget_type: 'grid', group_by: ['Region', 'State'] }
        ]
      }

      const tableRefsMap = new Map([['Sales', 5]])
      const colRefsMap = new Map([
        ['Sales.Region', 10],
        ['Sales.State', 11]
      ])

      const actions = buildHierarchicalPattern(config, tableRefsMap, colRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'record', [10], null])
      expect(actions[1]).toEqual(['CreateViewSection', 5, 0, 'record', [10, 11], null])
    })

    it('throws ValidationError when table not found', () => {
      const config: HierarchicalConfig = {
        pattern: 'hierarchical',
        levels: [
          { table: 'Missing', widget_type: 'grid', group_by: ['Region'] },
          { table: 'Sales', widget_type: 'grid', group_by: ['State'] }
        ]
      }

      const tableRefsMap = new Map([['Sales', 5]])
      const colRefsMap = new Map()

      expect(() => buildHierarchicalPattern(config, tableRefsMap, colRefsMap)).toThrow(
        ValidationError
      )
      expect(() => buildHierarchicalPattern(config, tableRefsMap, colRefsMap)).toThrow('Missing')
    })

    it('throws ValidationError when group_by column not found', () => {
      const config: HierarchicalConfig = {
        pattern: 'hierarchical',
        levels: [{ table: 'Sales', widget_type: 'grid', group_by: ['MissingColumn'] }]
      }

      const tableRefsMap = new Map([['Sales', 5]])
      const colRefsMap = new Map([['Sales.Region', 10]])

      expect(() => buildHierarchicalPattern(config, tableRefsMap, colRefsMap)).toThrow(
        ValidationError
      )
      expect(() => buildHierarchicalPattern(config, tableRefsMap, colRefsMap)).toThrow(
        'MissingColumn'
      )
    })

    it('handles multiple levels with different tables', () => {
      const config: HierarchicalConfig = {
        pattern: 'hierarchical',
        levels: [
          { table: 'Sales', widget_type: 'grid', group_by: ['Region'] },
          { table: 'Products', widget_type: 'card_list', group_by: ['Category'] }
        ]
      }

      const tableRefsMap = new Map([
        ['Sales', 5],
        ['Products', 10]
      ])
      const colRefsMap = new Map([
        ['Sales.Region', 15],
        ['Products.Category', 20]
      ])

      const actions = buildHierarchicalPattern(config, tableRefsMap, colRefsMap)

      expect(actions[0][1]).toBe(5) // Sales tableRef
      expect(actions[0][4]).toEqual([15]) // Region colRef
      expect(actions[1][1]).toBe(10) // Products tableRef
      expect(actions[1][4]).toEqual([20]) // Category colRef
    })
  })

  describe('buildChartDashboardPattern', () => {
    it('builds actions without selector', () => {
      const config: ChartDashboardConfig = {
        pattern: 'chart_dashboard',
        charts: [
          { table: 'Sales', widget_type: 'chart' },
          { table: 'Products', widget_type: 'chart' }
        ]
      }

      const tableRefsMap = new Map([
        ['Sales', 5],
        ['Products', 10]
      ])

      const actions = buildChartDashboardPattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'chart', null, null])
      expect(actions[1]).toEqual(['CreateViewSection', 10, 0, 'chart', null, null])
    })

    it('builds actions with selector', () => {
      const config: ChartDashboardConfig = {
        pattern: 'chart_dashboard',
        selector: { table: 'Sales', widget_type: 'grid' },
        charts: [{ table: 'Sales', widget_type: 'chart' }]
      }

      const tableRefsMap = new Map([['Sales', 5]])

      const actions = buildChartDashboardPattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'record', null, null])
      expect(actions[1]).toEqual(['CreateViewSection', 5, 0, 'chart', null, null])
    })

    it('throws ValidationError when selector table not found', () => {
      const config: ChartDashboardConfig = {
        pattern: 'chart_dashboard',
        selector: { table: 'Missing', widget_type: 'grid' },
        charts: []
      }

      const tableRefsMap = new Map()

      expect(() => buildChartDashboardPattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildChartDashboardPattern(config, tableRefsMap)).toThrow('Missing')
    })

    it('throws ValidationError when chart table not found', () => {
      const config: ChartDashboardConfig = {
        pattern: 'chart_dashboard',
        charts: [{ table: 'Missing', widget_type: 'chart' }]
      }

      const tableRefsMap = new Map()

      expect(() => buildChartDashboardPattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildChartDashboardPattern(config, tableRefsMap)).toThrow('Missing')
    })

    it('creates chart widgets with chart type', () => {
      const config: ChartDashboardConfig = {
        pattern: 'chart_dashboard',
        charts: [
          { table: 'Sales', widget_type: 'chart' },
          { table: 'Revenue', widget_type: 'chart' }
        ]
      }

      const tableRefsMap = new Map([
        ['Sales', 5],
        ['Revenue', 10]
      ])

      const actions = buildChartDashboardPattern(config, tableRefsMap)

      actions.forEach((action) => {
        expect(action[3]).toBe('chart')
      })
    })
  })

  describe('buildFormTablePattern', () => {
    it('builds actions for form-table pattern', () => {
      const config: FormTableConfig = {
        pattern: 'form_table',
        form: { table: 'Users', widget_type: 'form' },
        table: { table: 'Users', widget_type: 'grid' },
        split: 'vertical'
      }

      const tableRefsMap = new Map([['Users', 5]])

      const actions = buildFormTablePattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'form', null, null])
      expect(actions[1]).toEqual(['CreateViewSection', 5, 0, 'record', null, null])
    })

    it('throws ValidationError when table not found', () => {
      const config: FormTableConfig = {
        pattern: 'form_table',
        form: { table: 'Missing', widget_type: 'form' },
        table: { table: 'Missing', widget_type: 'grid' },
        split: 'horizontal'
      }

      const tableRefsMap = new Map()

      expect(() => buildFormTablePattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildFormTablePattern(config, tableRefsMap)).toThrow('Missing')
    })

    it('creates form widget first, table widget second', () => {
      const config: FormTableConfig = {
        pattern: 'form_table',
        form: { table: 'Users', widget_type: 'form' },
        table: { table: 'Users', widget_type: 'card_list' },
        split: 'horizontal'
      }

      const tableRefsMap = new Map([['Users', 5]])

      const actions = buildFormTablePattern(config, tableRefsMap)

      expect(actions[0][3]).toBe('form')
      expect(actions[1][3]).toBe('detail') // card_list -> detail
    })
  })

  describe('buildCustomPattern', () => {
    it('builds actions for custom pattern', () => {
      const config: CustomConfig = {
        pattern: 'custom',
        widgets: [
          { table: 'Users', widget_type: 'grid' },
          { table: 'Products', widget_type: 'card' }
        ]
      }

      const tableRefsMap = new Map([
        ['Users', 5],
        ['Products', 10]
      ])

      const actions = buildCustomPattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
      expect(actions[0]).toEqual(['CreateViewSection', 5, 0, 'record', null, null])
      expect(actions[1]).toEqual(['CreateViewSection', 10, 0, 'single', null, null])
    })

    it('throws ValidationError when table not found', () => {
      const config: CustomConfig = {
        pattern: 'custom',
        widgets: [{ table: 'Missing', widget_type: 'grid' }]
      }

      const tableRefsMap = new Map()

      expect(() => buildCustomPattern(config, tableRefsMap)).toThrow(ValidationError)
      expect(() => buildCustomPattern(config, tableRefsMap)).toThrow('Missing')
    })

    it('handles widgets with link configuration', () => {
      const config: CustomConfig = {
        pattern: 'custom',
        widgets: [
          { table: 'Users', widget_type: 'grid' },
          { table: 'Orders', widget_type: 'card_list', link_to: 'Users', link_field: 'user_id' }
        ]
      }

      const tableRefsMap = new Map([
        ['Users', 5],
        ['Orders', 10]
      ])

      const actions = buildCustomPattern(config, tableRefsMap)

      expect(actions).toHaveLength(2)
    })
  })

  describe('buildWidgetLinkActionWithIndex', () => {
    it('builds link action with result indexes', () => {
      const action = buildWidgetLinkActionWithIndex(1, 0, 10, 15)

      expect(action).toEqual([
        'UpdateRecord',
        '_grist_Views_section',
        1,
        {
          linkSrcSectionRef: 0,
          linkSrcColRef: 10,
          linkTargetColRef: 15
        }
      ])
    })

    it('links widgets with correct references', () => {
      const action = buildWidgetLinkActionWithIndex(5, 3, 100, 200)

      expect(action[2]).toBe(5) // target section
      const updates = action[3] as Record<string, number>
      expect(updates.linkSrcSectionRef).toBe(3) // source section
      expect(updates.linkSrcColRef).toBe(100) // source column
      expect(updates.linkTargetColRef).toBe(200) // target column
    })
  })

  describe('buildWidgetLinkAction', () => {
    it('builds link action with section IDs', () => {
      const action = buildWidgetLinkAction(5, 3, 10, 15)

      expect(action).toEqual([
        'UpdateRecord',
        '_grist_Views_section',
        5,
        {
          linkSrcSectionRef: 3,
          linkSrcColRef: 10,
          linkTargetColRef: 15
        }
      ])
    })

    it('throws ValidationError for null sourceColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, null as unknown as number, 15)).toThrow(
        ValidationError
      )
      expect(() => buildWidgetLinkAction(5, 3, null as unknown as number, 15)).toThrow(
        'sourceColRef must be a valid number'
      )
    })

    it('throws ValidationError for undefined sourceColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, undefined as unknown as number, 15)).toThrow(
        ValidationError
      )
    })

    it('throws ValidationError for NaN sourceColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, Number.NaN, 15)).toThrow(ValidationError)
    })

    it('throws ValidationError for null targetColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, 10, null as unknown as number)).toThrow(
        ValidationError
      )
      expect(() => buildWidgetLinkAction(5, 3, 10, null as unknown as number)).toThrow(
        'targetColRef must be a valid number'
      )
    })

    it('throws ValidationError for undefined targetColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, 10, undefined as unknown as number)).toThrow(
        ValidationError
      )
    })

    it('throws ValidationError for NaN targetColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, 10, Number.NaN)).toThrow(ValidationError)
    })

    it('throws ValidationError for non-numeric sourceColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, 'not a number' as unknown as number, 15)).toThrow(
        ValidationError
      )
    })

    it('throws ValidationError for non-numeric targetColRef', () => {
      expect(() => buildWidgetLinkAction(5, 3, 10, 'not a number' as unknown as number)).toThrow(
        ValidationError
      )
    })
  })

  describe('buildWidgetSortAction', () => {
    it('builds sort action with numeric spec', () => {
      const action = buildWidgetSortAction(5, [1, -2, 3])

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views_section')
      expect(action[2]).toBe(5)
      const updates = action[3] as Record<string, string>
      expect(JSON.parse(updates.sortColRefs)).toEqual([1, -2, 3])
    })

    it('builds sort action with string spec', () => {
      const action = buildWidgetSortAction(5, ['Name', '-Price'])

      const updates = action[3] as Record<string, string>
      expect(JSON.parse(updates.sortColRefs)).toEqual(['Name', '-Price'])
    })

    it('builds sort action with empty spec', () => {
      const action = buildWidgetSortAction(5, [])

      const updates = action[3] as Record<string, string>
      expect(JSON.parse(updates.sortColRefs)).toEqual([])
    })
  })

  describe('buildWidgetFilterAction', () => {
    it('builds filter action with included values', () => {
      const action = buildWidgetFilterAction(5, 10, { included: ['A', 'B', 'C'] }, false)

      expect(action[0]).toBe('AddRecord')
      expect(action[1]).toBe('_grist_Filters')
      expect(action[2]).toBe(null)
      const values = action[3] as Record<string, unknown>
      expect(values.viewSectionRef).toBe(5)
      expect(values.colRef).toBe(10)
      expect(JSON.parse(values.filter as string)).toEqual({ included: ['A', 'B', 'C'] })
      expect(values.pinned).toBe(false)
    })

    it('builds filter action with excluded values', () => {
      const action = buildWidgetFilterAction(5, 10, { excluded: [1, 2, 3] }, true)

      const values = action[3] as Record<string, unknown>
      expect(JSON.parse(values.filter as string)).toEqual({ excluded: [1, 2, 3] })
      expect(values.pinned).toBe(true)
    })

    it('sets pinned flag correctly', () => {
      const unpinnedAction = buildWidgetFilterAction(5, 10, { included: ['A'] }, false)
      const pinnedAction = buildWidgetFilterAction(5, 10, { included: ['A'] }, true)

      expect((unpinnedAction[3] as Record<string, unknown>).pinned).toBe(false)
      expect((pinnedAction[3] as Record<string, unknown>).pinned).toBe(true)
    })
  })

  describe('buildViewNameAndLayoutAction', () => {
    it('builds action with name and layout', () => {
      const layout: LayoutSpec = { type: 'leaf', leaf: 5 }
      const action = buildViewNameAndLayoutAction(1, 'My Page', layout)

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views')
      expect(action[2]).toBe(1)
      const updates = action[3] as Record<string, string>
      expect(updates.name).toBe('My Page')
      expect(JSON.parse(updates.layoutSpec)).toEqual(layout)
    })

    it('handles complex layout', () => {
      const layout: LayoutSpec = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.6
      }
      const action = buildViewNameAndLayoutAction(5, 'Dashboard', layout)

      const updates = action[3] as Record<string, string>
      expect(JSON.parse(updates.layoutSpec)).toEqual(layout)
    })
  })

  describe('buildUpdateLayoutAction', () => {
    it('builds layout update action', () => {
      const layout: LayoutSpec = { type: 'leaf', leaf: 10 }
      const action = buildUpdateLayoutAction(5, layout)

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views')
      expect(action[2]).toBe(5)
      const updates = action[3] as Record<string, string>
      expect(JSON.parse(updates.layoutSpec)).toEqual(layout)
    })
  })

  describe('buildAddPageAction', () => {
    it('builds add page action', () => {
      const action = buildAddPageAction(10, 5)

      expect(action).toEqual([
        'AddRecord',
        '_grist_Pages',
        null,
        {
          viewRef: 10,
          indentation: 0,
          pagePos: 5
        }
      ])
    })

    it('sets indentation to 0', () => {
      const action = buildAddPageAction(10, 0)

      const values = action[3] as Record<string, unknown>
      expect(values.indentation).toBe(0)
    })

    it('uses null rowId for auto-generation', () => {
      const action = buildAddPageAction(10, 0)

      expect(action[2]).toBe(null)
    })
  })

  describe('buildRenamePageAction', () => {
    it('builds rename action', () => {
      const action = buildRenamePageAction(5, 'New Page Name')

      expect(action).toEqual(['UpdateRecord', '_grist_Views', 5, { name: 'New Page Name' }])
    })
  })

  describe('buildDeletePageAction', () => {
    it('builds delete action', () => {
      const action = buildDeletePageAction(5)

      expect(action).toEqual(['BulkRemoveRecord', '_grist_Views', [5]])
    })

    it('wraps viewId in array', () => {
      const action = buildDeletePageAction(10)

      expect(action[2]).toEqual([10])
    })
  })

  describe('processCreateViewSectionResults', () => {
    it('processes valid results', () => {
      const results = [
        { tableRef: 5, viewRef: 10, sectionRef: 15, fieldRefs: [1, 2, 3] },
        { tableRef: 6, viewRef: 10, sectionRef: 16, fieldRefs: [4, 5] }
      ]

      const processed = processCreateViewSectionResults(results)

      expect(processed).toEqual(results)
    })

    it('filters out non-object results', () => {
      const results = [
        { tableRef: 5, viewRef: 10, sectionRef: 15, fieldRefs: [1] },
        'invalid',
        null,
        undefined,
        123
      ]

      const processed = processCreateViewSectionResults(results)

      expect(processed).toHaveLength(1)
      expect(processed[0]).toEqual({ tableRef: 5, viewRef: 10, sectionRef: 15, fieldRefs: [1] })
    })

    it('handles missing properties with defaults', () => {
      const results = [{ tableRef: 5 }, { viewRef: 10 }, { sectionRef: 15 }, {}]

      const processed = processCreateViewSectionResults(
        results as unknown as CreateViewSectionResult[]
      )

      expect(processed).toEqual([
        { tableRef: 5, viewRef: 0, sectionRef: 0, fieldRefs: [] },
        { tableRef: 0, viewRef: 10, sectionRef: 0, fieldRefs: [] },
        { tableRef: 0, viewRef: 0, sectionRef: 15, fieldRefs: [] },
        { tableRef: 0, viewRef: 0, sectionRef: 0, fieldRefs: [] }
      ])
    })

    it('handles empty results array', () => {
      const processed = processCreateViewSectionResults([])

      expect(processed).toEqual([])
    })

    it('preserves fieldRefs arrays', () => {
      const results = [{ tableRef: 5, viewRef: 10, sectionRef: 15, fieldRefs: [100, 200, 300] }]

      const processed = processCreateViewSectionResults(results)

      expect(processed[0]?.fieldRefs).toEqual([100, 200, 300])
    })
  })

  describe('buildLeafLayout', () => {
    it('builds leaf layout', () => {
      const layout = buildLeafLayout(5)

      expect(layout).toEqual({ type: 'leaf', leaf: 5 })
    })
  })

  describe('buildHorizontalSplitLayout', () => {
    it('builds horizontal split with default ratio', () => {
      const layout = buildHorizontalSplitLayout(1, 2)

      expect(layout).toEqual({
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.5
      })
    })

    it('builds horizontal split with custom ratio', () => {
      const layout = buildHorizontalSplitLayout(1, 2, 0.7)

      expect(layout.splitRatio).toBe(0.7)
    })

    it('creates leaf children', () => {
      const layout = buildHorizontalSplitLayout(10, 20)

      expect(layout.children).toEqual([
        { type: 'leaf', leaf: 10 },
        { type: 'leaf', leaf: 20 }
      ])
    })
  })

  describe('buildVerticalSplitLayout', () => {
    it('builds vertical split with default ratio', () => {
      const layout = buildVerticalSplitLayout(1, 2)

      expect(layout).toEqual({
        type: 'vsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.5
      })
    })

    it('builds vertical split with custom ratio', () => {
      const layout = buildVerticalSplitLayout(1, 2, 0.3)

      expect(layout.splitRatio).toBe(0.3)
    })

    it('creates leaf children', () => {
      const layout = buildVerticalSplitLayout(5, 10)

      expect(layout.children).toEqual([
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ])
    })
  })

  describe('configureChartAxes', () => {
    it('returns empty array when no axes specified', async () => {
      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        undefined,
        undefined
      )

      expect(actions).toEqual([])
      expect(mockClient.post).not.toHaveBeenCalled()
    })

    it('returns empty array when yAxis is empty', async () => {
      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        undefined,
        []
      )

      expect(actions).toEqual([])
    })

    it('configures x-axis only', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [{ colId: 'Name', colRef: 10 }]
        })
        .mockResolvedValueOnce({
          records: []
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        undefined
      )

      expect(mockClient.post).toHaveBeenCalledTimes(2)
      expect(actions.length).toBeGreaterThan(0)
    })

    it('configures y-axis only', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Price', colRef: 10 },
            { colId: 'Quantity', colRef: 11 }
          ]
        })
        .mockResolvedValueOnce({
          records: []
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        undefined,
        ['Price', 'Quantity']
      )

      expect(actions.length).toBeGreaterThan(0)
    })

    it('configures both x and y axes', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 },
            { colId: 'Quantity', colRef: 12 }
          ]
        })
        .mockResolvedValueOnce({
          records: []
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price', 'Quantity']
      )

      expect(actions.length).toBeGreaterThan(0)
    })

    it('throws ValidationError for missing x-axis column', async () => {
      mockClient.post.mockResolvedValue({
        records: []
      })

      await expect(
        configureChartAxes(
          mockClient as unknown as GristClient,
          'docId',
          5,
          'Table1',
          'MissingCol',
          undefined
        )
      ).rejects.toThrow(ValidationError)

      await expect(
        configureChartAxes(
          mockClient as unknown as GristClient,
          'docId',
          5,
          'Table1',
          'MissingCol',
          undefined
        )
      ).rejects.toThrow('MissingCol')
    })

    it('throws ValidationError for missing y-axis column', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ colId: 'Name', colRef: 10 }]
      })

      await expect(
        configureChartAxes(mockClient as unknown as GristClient, 'docId', 5, 'Table1', 'Name', [
          'MissingCol'
        ])
      ).rejects.toThrow(ValidationError)

      await expect(
        configureChartAxes(mockClient as unknown as GristClient, 'docId', 5, 'Table1', 'Name', [
          'MissingCol'
        ])
      ).rejects.toThrow('MissingCol')
    })

    it('removes unwanted existing fields', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          // Columns in table
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 },
            { colId: 'OldCol', colRef: 12 }
          ]
        })
        .mockResolvedValueOnce({
          // Existing fields in section
          records: [
            { fieldId: 100, colRef: 12 }, // OldCol - should be removed
            { fieldId: 101, colRef: 10 } // Name - should be kept
          ]
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price']
      )

      const removeAction = actions.find((a) => a[0] === 'BulkRemoveRecord')
      expect(removeAction).toBeDefined()
      expect(removeAction).toEqual(['BulkRemoveRecord', '_grist_Views_section_field', [100]])
    })

    it('updates existing field positions', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            { fieldId: 100, colRef: 10 },
            { fieldId: 101, colRef: 11 }
          ]
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price']
      )

      const updateAction = actions.find((a) => a[0] === 'BulkUpdateRecord')
      expect(updateAction).toBeDefined()
      expect(updateAction?.[1]).toBe('_grist_Views_section_field')
      expect(updateAction?.[2]).toEqual([100, 101])
    })

    it('adds missing fields', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 }
          ]
        })
        .mockResolvedValueOnce({
          records: [{ fieldId: 100, colRef: 10 }] // Only Name exists
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price']
      )

      const addAction = actions.find((a) => a[0] === 'BulkAddRecord')
      expect(addAction).toBeDefined()
      expect(addAction?.[1]).toBe('_grist_Views_section_field')
      const colValues = addAction?.[3] as Record<string, unknown[]>
      expect(colValues.parentId).toEqual([5])
      expect(colValues.colRef).toEqual([11])
      expect(colValues.parentPos).toEqual([2])
    })

    it('handles nested fields structure in columns response', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [{ fields: { colId: 'Name', colRef: 10 } }]
        })
        .mockResolvedValueOnce({
          records: []
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        undefined
      )

      expect(actions.length).toBeGreaterThan(0)
    })

    it('handles nested fields structure in fields response', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [{ colId: 'Name', colRef: 10 }]
        })
        .mockResolvedValueOnce({
          records: [{ fields: { fieldId: 100, colRef: 10 } }]
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        undefined
      )

      expect(actions.length).toBeGreaterThan(0)
    })

    it('sets correct parentPos for multiple y-axis columns', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 },
            { colId: 'Quantity', colRef: 12 },
            { colId: 'Total', colRef: 13 }
          ]
        })
        .mockResolvedValueOnce({
          records: []
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price', 'Quantity', 'Total']
      )

      const addAction = actions.find((a) => a[0] === 'BulkAddRecord')
      const colValues = addAction?.[3] as Record<string, unknown[]>
      expect(colValues.parentPos).toEqual([1, 2, 3, 4]) // x-axis=1, y-axes=2,3,4
    })

    it('combines remove, update, and add actions correctly', async () => {
      mockClient.post
        .mockResolvedValueOnce({
          records: [
            { colId: 'Name', colRef: 10 },
            { colId: 'Price', colRef: 11 },
            { colId: 'NewCol', colRef: 12 }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            { fieldId: 100, colRef: 10 }, // Keep (Name)
            { fieldId: 101, colRef: 99 } // Remove (OldCol)
          ]
        })

      const actions = await configureChartAxes(
        mockClient as unknown as GristClient,
        'docId',
        5,
        'Table1',
        'Name',
        ['Price', 'NewCol']
      )

      expect(actions.find((a) => a[0] === 'BulkRemoveRecord')).toBeDefined()
      expect(actions.find((a) => a[0] === 'BulkUpdateRecord')).toBeDefined()
      expect(actions.find((a) => a[0] === 'BulkAddRecord')).toBeDefined()
    })
  })
})
