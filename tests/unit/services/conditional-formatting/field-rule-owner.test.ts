import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldRuleOwner } from '../../../../src/services/conditional-formatting/field-rule-owner.js'
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

describe('FieldRuleOwner', () => {
  let owner: FieldRuleOwner
  let mockClient: GristClient

  beforeEach(() => {
    owner = new FieldRuleOwner()
    mockClient = {
      get: vi.fn(),
      post: vi.fn()
    } as unknown as GristClient
  })

  describe('config', () => {
    it('has correct configuration', () => {
      expect(owner.config).toEqual({
        metadataTable: '_grist_Views_section_field',
        rulesProperty: 'rules',
        styleProperty: 'widgetOptions',
        stylesInWidgetOptions: true,
        helperColumnPrefix: 'gristHelper_ConditionalRule',
        scopeName: 'field'
      })
    })
  })

  describe('getAddEmptyRuleParams', () => {
    it('returns [fieldRef, 0] for field scope', () => {
      const result = owner.getAddEmptyRuleParams({
        docId: 'doc123',
        tableId: 'Table1',
        ownerRef: 150
      })

      expect(result).toEqual([150, 0])
    })
  })

  describe('getOwnerRef', () => {
    it('returns fieldRef for valid field', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              fieldId: 150
            }
          }
        ]
      })

      const result = await owner.getOwnerRef(mockClient, 'doc123', {
        tableId: 'Table1',
        sectionId: 5,
        fieldColId: 'Price'
      })

      expect(result).toBe(150)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT f.id as fieldId'),
        args: [5, 'Price']
      })
    })

    it('throws error when sectionId is missing', async () => {
      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          fieldColId: 'Price'
        })
      ).rejects.toThrow('sectionId is required for field scope')
    })

    it('throws error when fieldColId is missing', async () => {
      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5
        })
      ).rejects.toThrow('colId (fieldColId) is required for field scope')
    })

    it('throws error when field is not found', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          records: [
            { fields: { colId: 'Price' } },
            { fields: { colId: 'Status' } },
            { fields: { colId: 'Quantity' } }
          ]
        })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'InvalidField'
        })
      ).rejects.toThrow('Field "InvalidField" not found in widget')
    })

    it('lists available fields in error message', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          records: [
            { fields: { colId: 'Price' } },
            { fields: { colId: 'Status' } },
            { fields: { colId: 'Quantity' } }
          ]
        })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'InvalidField'
        })
      ).rejects.toThrow('Available fields: Price, Status, Quantity')
    })

    it('mentions case sensitivity in error message', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          records: [{ fields: { colId: 'Price' } }]
        })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'price'
        })
      ).rejects.toThrow('Column names are case-sensitive')
    })

    it('throws error when fieldId is invalid', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              fieldId: 0
            }
          }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'Price'
        })
      ).rejects.toThrow('Invalid field ID returned')
    })

    it('throws error when fieldId is negative', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              fieldId: -1
            }
          }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'Price'
        })
      ).rejects.toThrow('Invalid field ID returned')
    })

    it('provides helpful error with grist_get_pages reference', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'Price'
        })
      ).rejects.toThrow('Use grist_get_pages to find widget details')
    })
  })

  describe('getRulesAndStyles', () => {
    it('retrieves rules and styles from field metadata', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '301,302,303',
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

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 150)

      expect(result.helperColRefs).toEqual([301, 302, 303])
      expect(result.styles).toEqual([
        { fillColor: '#FF0000' },
        { fillColor: '#00FF00' },
        { fillColor: '#0000FF' }
      ])
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rules, widgetOptions'),
        args: [150]
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

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 150)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('returns empty arrays when field not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 150)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('handles missing rulesOptions in widgetOptions', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '301,302',
              widgetOptions: JSON.stringify({ alignment: 'center' })
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 150)

      expect(result.helperColRefs).toEqual([301, 302])
      expect(result.styles).toEqual([])
    })

    it('handles null widgetOptions', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '301',
              widgetOptions: null
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 150)

      expect(result.helperColRefs).toEqual([301])
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
                  alignment: 'right',
                  dateFormat: 'YYYY-MM-DD'
                })
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 150, {
        helperColRefs: [301, 302],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      // First call: get current widgetOptions
      expect(mockClient.post).toHaveBeenNthCalledWith(1, '/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT widgetOptions'),
        args: [150]
      })

      // Second call: update with merged options
      expect(mockClient.post).toHaveBeenNthCalledWith(
        2,
        '/docs/doc123/apply',
        [
          [
            'UpdateRecord',
            '_grist_Views_section_field',
            150,
            {
              rules: JSON.stringify([301, 302]),
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
      expect(widgetOptions.alignment).toBe('right')
      expect(widgetOptions.dateFormat).toBe('YYYY-MM-DD')
    })

    it('handles empty current widgetOptions', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 150, {
        helperColRefs: [301],
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

      await owner.updateRulesAndStyles(mockClient, 'doc123', 150, {
        helperColRefs: [301],
        styles: [{ fillColor: '#FF0000' }]
      })

      expect(validateRetValues).toHaveBeenCalledWith(
        { retValues: [] },
        { context: 'Updating field conditional rules' }
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

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 150)

      expect(result).toEqual({
        alignment: 'center',
        rulesOptions: [{ fillColor: '#FF0000' }]
      })
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT widgetOptions'),
        args: [150]
      })
    })

    it('returns empty object when field not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 150)

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

      const result = await owner.getWidgetOptionsFresh(mockClient, 'doc123', 150)

      expect(result).toEqual({})
    })
  })
})
