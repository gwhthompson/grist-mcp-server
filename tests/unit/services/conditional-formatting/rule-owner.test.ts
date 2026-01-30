import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleOwner } from '../../../../src/services/conditional-formatting/service.js'
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

describe('RuleOwner', () => {
  let mockClient: GristClient

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn()
    } as unknown as GristClient
  })

  // ===========================================================================
  // Scope Configuration
  // ===========================================================================

  describe('config', () => {
    it('has correct column scope configuration', () => {
      const owner = new RuleOwner('column')
      expect(owner.config).toEqual({
        metadataTable: '_grist_Tables_column',
        rulesProperty: 'rules',
        styleProperty: 'widgetOptions',
        stylesInWidgetOptions: true,
        helperColumnPrefix: 'gristHelper_ConditionalRule',
        scopeName: 'column'
      })
    })

    it('has correct field scope configuration', () => {
      const owner = new RuleOwner('field')
      expect(owner.config).toEqual({
        metadataTable: '_grist_Views_section_field',
        rulesProperty: 'rules',
        styleProperty: 'widgetOptions',
        stylesInWidgetOptions: true,
        helperColumnPrefix: 'gristHelper_ConditionalRule',
        scopeName: 'field'
      })
    })

    it('has correct row scope configuration', () => {
      const owner = new RuleOwner('row')
      expect(owner.config).toEqual({
        metadataTable: '_grist_Views_section',
        rulesProperty: 'rules',
        styleProperty: 'options',
        stylesInWidgetOptions: false,
        helperColumnPrefix: 'gristHelper_RowConditionalRule',
        scopeName: 'row'
      })
    })
  })

  // ===========================================================================
  // getAddEmptyRuleParams
  // ===========================================================================

  describe('getAddEmptyRuleParams', () => {
    it('returns [0, colRef] for column scope', () => {
      const owner = new RuleOwner('column')
      expect(owner.getAddEmptyRuleParams({ docId: 'doc123', tableId: 'T', ownerRef: 100 })).toEqual(
        [0, 100]
      )
    })

    it('returns [fieldRef, 0] for field scope', () => {
      const owner = new RuleOwner('field')
      expect(owner.getAddEmptyRuleParams({ docId: 'doc123', tableId: 'T', ownerRef: 150 })).toEqual(
        [150, 0]
      )
    })

    it('returns [0, 0] for row scope', () => {
      const owner = new RuleOwner('row')
      expect(owner.getAddEmptyRuleParams({ docId: 'doc123', tableId: 'T', ownerRef: 50 })).toEqual([
        0, 0
      ])
    })
  })

  // ===========================================================================
  // getOwnerRef - Column scope
  // ===========================================================================

  describe('getOwnerRef (column)', () => {
    let owner: RuleOwner

    beforeEach(() => {
      owner = new RuleOwner('column')
    })

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
      await expect(owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1' })).rejects.toThrow(
        'colId is required for column scope'
      )
    })

    it('throws error when column is not found', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        columns: [{ id: 'Price', fields: { colRef: 100 } }]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1', colId: 'InvalidCol' })
      ).rejects.toThrow('Column "InvalidCol" not found in table "Table1"')
    })

    it('provides helpful error with tool reference', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({ columns: [] })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1', colId: 'X' })
      ).rejects.toThrow('Use grist_get_tables with detail_level="full_schema" to list columns')
    })
  })

  // ===========================================================================
  // getOwnerRef - Field scope
  // ===========================================================================

  describe('getOwnerRef (field)', () => {
    let owner: RuleOwner

    beforeEach(() => {
      owner = new RuleOwner('field')
    })

    it('returns fieldRef for valid field', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { fieldId: 150 } }]
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
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1', fieldColId: 'Price' })
      ).rejects.toThrow('sectionId is required for field scope')
    })

    it('throws error when fieldColId is missing', async () => {
      await expect(
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1', sectionId: 5 })
      ).rejects.toThrow('colId (fieldColId) is required for field scope')
    })

    it('throws error when field is not found', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [{ fields: { colId: 'Price' } }, { fields: { colId: 'Status' } }]
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
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [{ fields: { colId: 'Price' } }, { fields: { colId: 'Status' } }]
        })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'InvalidField'
        })
      ).rejects.toThrow('Available fields: Price, Status')
    })

    it('mentions case sensitivity in error message', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [{ fields: { colId: 'Price' } }] })

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
        records: [{ fields: { fieldId: 0 } }]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1',
          sectionId: 5,
          fieldColId: 'Price'
        })
      ).rejects.toThrow('Invalid field ID returned')
    })
  })

  // ===========================================================================
  // getOwnerRef - Row scope
  // ===========================================================================

  describe('getOwnerRef (row)', () => {
    let owner: RuleOwner

    beforeEach(() => {
      owner = new RuleOwner('row')
    })

    it('returns rawViewSectionRef for valid table', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { rawViewSectionRef: 50 } }]
      })

      const result = await owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1' })

      expect(result).toBe(50)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rawViewSectionRef'),
        args: ['Table1']
      })
    })

    it('throws error when table is not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({ records: [] })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'InvalidTable' })
      ).rejects.toThrow('Table "InvalidTable" not found')
    })

    it('throws error when rawViewSectionRef is invalid', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { rawViewSectionRef: 0 } }]
      })

      await expect(owner.getOwnerRef(mockClient, 'doc123', { tableId: 'Table1' })).rejects.toThrow(
        'has no rawViewSectionRef'
      )
    })

    it('provides helpful error message for missing table', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({ records: [] })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', { tableId: 'InvalidTable' })
      ).rejects.toThrow('Use grist_get_tables to list available tables')
    })
  })

  // ===========================================================================
  // getRulesAndStyles
  // ===========================================================================

  describe('getRulesAndStyles', () => {
    it('retrieves rules from column metadata (widgetOptions)', async () => {
      const owner = new RuleOwner('column')
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
      expect(result.styles).toHaveLength(3)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rules, widgetOptions'),
        args: [100]
      })
    })

    it('retrieves rules from row metadata (options)', async () => {
      const owner = new RuleOwner('row')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '201,202',
              options: JSON.stringify({
                rulesOptions: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
              })
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([201, 202])
      expect(result.styles).toHaveLength(2)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rules, options'),
        args: [50]
      })
    })

    it('returns empty arrays when no records found', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({ records: [] })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('returns empty arrays when no rules exist', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { rules: '', widgetOptions: '{}' } }]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('handles missing rulesOptions', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { rules: '101,102', widgetOptions: JSON.stringify({ someOtherOption: true }) } }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([101, 102])
      expect(result.styles).toEqual([])
    })

    it('handles null options value', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { rules: '101', widgetOptions: null } }]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 100)

      expect(result.helperColRefs).toEqual([101])
      expect(result.styles).toEqual([])
    })
  })

  // ===========================================================================
  // updateRulesAndStyles
  // ===========================================================================

  describe('updateRulesAndStyles', () => {
    it('updates column rules preserving other widgetOptions', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: [
            {
              fields: {
                widgetOptions: JSON.stringify({ alignment: 'center', someOtherOption: true })
              }
            }
          ]
        })
        .mockResolvedValueOnce({ retValues: [] })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 100, {
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      expect(mockClient.post).toHaveBeenNthCalledWith(1, '/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT widgetOptions'),
        args: [100]
      })

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

      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const widgetOptions = JSON.parse(applyCall[1][0][3].widgetOptions)
      expect(widgetOptions.rulesOptions).toEqual([
        { fillColor: '#FF0000' },
        { fillColor: '#00FF00' }
      ])
      expect(widgetOptions.alignment).toBe('center')
    })

    it('updates row rules preserving other options', async () => {
      const owner = new RuleOwner('row')
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: [{ fields: { options: JSON.stringify({ sortSpec: ['Price'] }) } }]
        })
        .mockResolvedValueOnce({ retValues: [] })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 50, {
        helperColRefs: [201],
        styles: [{ fillColor: '#FF0000' }]
      })

      expect(mockClient.post).toHaveBeenNthCalledWith(
        2,
        '/docs/doc123/apply',
        [
          [
            'UpdateRecord',
            '_grist_Views_section',
            50,
            {
              rules: JSON.stringify([201]),
              options: expect.stringContaining('sortSpec')
            }
          ]
        ],
        expect.any(Object)
      )

      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const options = JSON.parse(applyCall[1][0][3].options)
      expect(options.rulesOptions).toEqual([{ fillColor: '#FF0000' }])
      expect(options.sortSpec).toEqual(['Price'])
    })

    it('handles empty current options', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ retValues: [] })

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
      const owner = new RuleOwner('row')

      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ retValues: [] })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 50, {
        helperColRefs: [201],
        styles: [{ fillColor: '#FF0000' }]
      })

      expect(validateRetValues).toHaveBeenCalledWith(
        { retValues: [] },
        { context: 'Updating row conditional rules' }
      )
    })
  })

  // ===========================================================================
  // predictNextHelperColId
  // ===========================================================================

  describe('predictNextHelperColId', () => {
    it('returns base name when no helpers exist', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({ records: [] })

      const result = await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule')
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT c.colId'),
        args: ['Table1', 'gristHelper_ConditionalRule%']
      })
    })

    it('returns base name when it is not taken (gap in numbering)', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { colId: 'gristHelper_ConditionalRule2' } },
          { fields: { colId: 'gristHelper_ConditionalRule3' } }
        ]
      })

      expect(await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')).toBe(
        'gristHelper_ConditionalRule'
      )
    })

    it('returns numbered variant when base name is taken', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { colId: 'gristHelper_ConditionalRule' } }]
      })

      expect(await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')).toBe(
        'gristHelper_ConditionalRule2'
      )
    })

    it('returns next available number when multiple helpers exist', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { colId: 'gristHelper_ConditionalRule' } },
          { fields: { colId: 'gristHelper_ConditionalRule2' } },
          { fields: { colId: 'gristHelper_ConditionalRule3' } }
        ]
      })

      expect(await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')).toBe(
        'gristHelper_ConditionalRule4'
      )
    })

    it('handles case-insensitive matching', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { colId: 'GRISTHELPER_CONDITIONALRULE' } }]
      })

      expect(await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')).toBe(
        'gristHelper_ConditionalRule2'
      )
    })

    it('handles colId at top level (not in fields)', async () => {
      const owner = new RuleOwner('column')
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ colId: 'gristHelper_ConditionalRule' }]
      })

      expect(await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')).toBe(
        'gristHelper_ConditionalRule2'
      )
    })

    it('uses row helper prefix for row scope', async () => {
      const owner = new RuleOwner('row')
      vi.mocked(mockClient.post).mockResolvedValue({ records: [] })

      const result = await owner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_RowConditionalRule')
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT c.colId'),
        args: ['Table1', 'gristHelper_RowConditionalRule%']
      })
    })
  })

  // ===========================================================================
  // getHelperColumnFormulas
  // ===========================================================================

  describe('getHelperColumnFormulas', () => {
    let owner: RuleOwner

    beforeEach(() => {
      owner = new RuleOwner('column')
    })

    it('returns empty array for empty input', async () => {
      const result = await owner.getHelperColumnFormulas(mockClient, 'doc123', [])

      expect(result).toEqual([])
      expect(mockClient.get).not.toHaveBeenCalled()
    })

    it('retrieves formulas for helper columns', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: '$Status == "Active"' } }
        ]
      })

      const result = await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', '$Status == "Active"'])
      expect(mockClient.get).toHaveBeenCalledWith(
        '/docs/doc123/tables/_grist_Tables_column/records',
        expect.objectContaining({ params: expect.objectContaining({ _: expect.any(String) }) })
      )
    })

    it('handles formula at top level (not in fields)', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, formula: '$Price > 100' },
          { id: 20, formula: '$Status == "Active"' }
        ]
      })

      expect(await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])).toEqual([
        '$Price > 100',
        '$Status == "Active"'
      ])
    })

    it('maintains order matching helperColRefs', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 20, fields: { formula: 'second' } },
          { id: 10, fields: { formula: 'first' } },
          { id: 30, fields: { formula: 'third' } }
        ]
      })

      expect(await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20, 30])).toEqual([
        'first',
        'second',
        'third'
      ])
    })

    it('returns empty string for missing formula', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: null } }
        ]
      })

      expect(await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])).toEqual([
        '$Price > 100',
        ''
      ])
    })

    it('returns empty string for missing colRef', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [{ id: 10, fields: { formula: '$Price > 100' } }]
      })

      expect(await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 999])).toEqual([
        '$Price > 100',
        ''
      ])
    })

    it('retries until all formulas are populated', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({
          records: [
            { id: 10, fields: { formula: '$Price > 100' } },
            { id: 20, fields: { formula: '' } }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            { id: 10, fields: { formula: '$Price > 100' } },
            { id: 20, fields: { formula: '$Status == "Active"' } }
          ]
        })

      const result = await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', '$Status == "Active"'])
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })

    it('stops retrying when all formulas are found', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: '$Status == "Active"' } }
        ]
      })

      await owner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(mockClient.get).toHaveBeenCalledTimes(1)
    })

    it('handles null formula values during retry', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({ records: [{ id: 10, fields: { formula: null } }] })
        .mockResolvedValueOnce({ records: [{ id: 10, fields: { formula: '$Price > 100' } }] })

      const result = await owner.getHelperColumnFormulas(mockClient, 'doc123', [10])

      expect(result).toEqual(['$Price > 100'])
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })

    it('handles undefined formula values during retry', async () => {
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({ records: [{ id: 10, fields: {} }] })
        .mockResolvedValueOnce({ records: [{ id: 10, fields: { formula: '$Price > 100' } }] })

      const result = await owner.getHelperColumnFormulas(mockClient, 'doc123', [10])

      expect(result).toEqual(['$Price > 100'])
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })
})
