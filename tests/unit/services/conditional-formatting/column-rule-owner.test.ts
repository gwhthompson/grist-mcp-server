import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ColumnRuleOwner } from '../../../../src/services/conditional-formatting/column-rule-owner.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// Mock dependencies
vi.mock('../../../../src/services/rule-utilities.js', () => ({
  parseGristList: vi.fn((value) => {
    if (typeof value === 'string') {
      return value === '' ? [] : value.split(',').map((s) => Number.parseInt(s.trim(), 10))
    }
    return Array.isArray(value) ? value : []
  }),
  parseGristJson: vi.fn((value, defaultVal) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return defaultVal
      }
    }
    return value || defaultVal
  }),
  encodeGristList: vi.fn((arr) => JSON.stringify(arr))
}))

vi.mock('../../../../src/validators/apply-response.js', () => ({
  validateRetValues: vi.fn()
}))

vi.mock('../../../../src/utils/grist-field-extractor.js', () => ({
  extractFields: vi.fn((record) => record.fields || record)
}))

vi.mock('../../../../src/utils/array-helpers.js', () => ({
  first: vi.fn((arr) => arr[0])
}))

describe('ColumnRuleOwner', () => {
  let owner: ColumnRuleOwner
  let mockClient: GristClient

  beforeEach(() => {
    owner = new ColumnRuleOwner()
    mockClient = {
      get: vi.fn(),
      post: vi.fn()
    } as unknown as GristClient
  })

  describe('config', () => {
    it('has correct configuration', () => {
      expect(owner.config).toEqual({
        metadataTable: '_grist_Tables_column',
        rulesProperty: 'rules',
        styleProperty: 'widgetOptions',
        stylesInWidgetOptions: true,
        helperColumnPrefix: 'gristHelper_ConditionalRule',
        scopeName: 'column'
      })
    })
  })

  describe('getAddEmptyRuleParams', () => {
    it('returns [0, colRef] for column scope', () => {
      const result = owner.getAddEmptyRuleParams({
        docId: 'doc123',
        tableId: 'Table1',
        ownerRef: 100
      })

      expect(result).toEqual([0, 100])
    })
  })

  describe('getOwnerRef', () => {
    it('returns colRef for valid column', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        columns: [
          { id: 'Price', fields: { colRef: 100 } },
          { id: 'Status', fields: { colRef: 101 } }
        ]
      })

      const result = await owner.getOwnerRef(mockClient, 'doc123', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result).toBe(100)
      expect(mockClient.get).toHaveBeenCalledWith('/docs/doc123/tables/Table1/columns')
    })

    it('throws error when colId is missing', async () => {
      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1'
        })
      ).rejects.toThrow('colId is required for column scope')
    })

    it('throws error when column is not found', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        columns: [
          { id: 'Price', fields: { colRef: 100 } },
          { id: 'Status', fields: { colRef: 101 } }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          colId: 'InvalidCol'
        })
      ).rejects.toThrow('Column "InvalidCol" not found in table "Table1"')
    })

    it('provides helpful error message with available columns', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        columns: [
          { id: 'Price', fields: { colRef: 100 } },
          { id: 'Status', fields: { colRef: 101 } }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          colId: 'InvalidCol'
        })
      ).rejects.toThrow('Use grist_get_tables with detail_level="full_schema" to list columns')
    })
  })

  describe('getRulesAndStyles', () => {
    it('retrieves rules and styles from column metadata', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '101,102,103',
              widgetOptions: JSON.stringify({
                rulesOptions: [
                  { fillColor: '#FF0000' },
                  { fillColor: '#00FF00' },
                  { fillColor: '#0000FF' }
                ]
              })
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([101, 102, 103])
      expect(result.styles).toEqual([
        { fillColor: '#FF0000' },
        { fillColor: '#00FF00' },
        { fillColor: '#0000FF' }
      ])
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rules, widgetOptions'),
        args: [100]
      })
    })

    it('returns empty arrays when no rules exist', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '',
              widgetOptions: '{}'
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('returns empty arrays when column not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('handles missing rulesOptions in widgetOptions', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '101,102',
              widgetOptions: JSON.stringify({ someOtherOption: true })
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([101, 102])
      expect(result.styles).toEqual([])
    })

    it('handles null widgetOptions', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '101',
              widgetOptions: null
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([101])
      expect(result.styles).toEqual([])
    })
  })

  describe('updateRulesAndStyles', () => {
    it('updates rules and styles preserving other widgetOptions', async () => {
      // Mock getting current widgetOptions
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: [
            {
              fields: {
                widgetOptions: JSON.stringify({
                  alignment: 'center',
                  someOtherOption: true
                })
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 100, {
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      // First call: get current widgetOptions
      expect(mockClient.post).toHaveBeenNthCalledWith(1, '/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT widgetOptions'),
        args: [100]
      })

      // Second call: update with merged options
      expect(mockClient.post).toHaveBeenNthCalledWith(
        2,
        '/docs/doc123/apply',
        [
          [
            'UpdateRecord',
            '_grist_Tables_column',
            100,
            {
              rules: JSON.stringify([101, 102]),
              widgetOptions: expect.stringContaining('alignment')
            }
          ]
        ],
        expect.any(Object)
      )

      // Verify rulesOptions is included
      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const widgetOptions = JSON.parse(applyCall[1][0][3].widgetOptions)
      expect(widgetOptions.rulesOptions).toEqual([
        { fillColor: '#FF0000' },
        { fillColor: '#00FF00' }
      ])
      expect(widgetOptions.alignment).toBe('center')
      expect(widgetOptions.someOtherOption).toBe(true)
    })

    it('handles empty current widgetOptions', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 100, {
        helperColRefs: [101],
        styles: [{ fillColor: '#FF0000' }]
      })

      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const widgetOptions = JSON.parse(applyCall[1][0][3].widgetOptions)
      expect(widgetOptions.rulesOptions).toEqual([{ fillColor: '#FF0000' }])
    })

    it('validates apply response', async () => {
      const { validateRetValues } = await import('../../../../src/validators/apply-response.js')

      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ retValues: [] })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 100, {
        helperColRefs: [101],
        styles: [{ fillColor: '#FF0000' }]
      })

      expect(validateRetValues).toHaveBeenCalledWith(
        { retValues: [] },
        { context: 'Updating column conditional rules' }
      )
    })
  })

  describe('getWidgetOptionsFresh', () => {
    it('retrieves fresh widgetOptions via SQL', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              widgetOptions: JSON.stringify({
                alignment: 'center',
                rulesOptions: [{ fillColor: '#FF0000' }]
              })
            }
          }
        ]
      })

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 'Table1', 'Price')

      expect(result).toEqual({
        alignment: 'center',
        rulesOptions: [{ fillColor: '#FF0000' }]
      })
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT c.widgetOptions'),
        args: ['Table1', 'Price']
      })
    })

    it('returns empty object when column not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 'Table1', 'Price')

      expect(result).toEqual({})
    })

    it('handles null widgetOptions', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              widgetOptions: null
            }
          }
        ]
      })

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 'Table1', 'Price')

      expect(result).toEqual({})
    })
  })
})
