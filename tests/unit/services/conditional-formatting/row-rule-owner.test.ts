import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RowRuleOwner } from '../../../../src/services/conditional-formatting/row-rule-owner.js'
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

describe('RowRuleOwner', () => {
  let owner: RowRuleOwner
  let mockClient: GristClient

  beforeEach(() => {
    owner = new RowRuleOwner()
    mockClient = {
      get: vi.fn(),
      post: vi.fn()
    } as unknown as GristClient
  })

  describe('config', () => {
    it('has correct configuration', () => {
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

  describe('getAddEmptyRuleParams', () => {
    it('returns [0, 0] for row scope', () => {
      const result = owner.getAddEmptyRuleParams({
        docId: 'doc123',
        tableId: 'Table1',
        ownerRef: 100
      })

      expect(result).toEqual([0, 0])
    })
  })

  describe('getOwnerRef', () => {
    it('returns rawViewSectionRef for valid table', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rawViewSectionRef: 50
            }
          }
        ]
      })

      const result = await owner.getOwnerRef(mockClient, 'doc123', {
        tableId: 'Table1'
      })

      expect(result).toBe(50)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rawViewSectionRef'),
        args: ['Table1']
      })
    })

    it('throws error when table is not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'InvalidTable'
        })
      ).rejects.toThrow('Table "InvalidTable" not found')
    })

    it('throws error when rawViewSectionRef is invalid', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rawViewSectionRef: 0
            }
          }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1'
        })
      ).rejects.toThrow('has no rawViewSectionRef')
    })

    it('throws error when rawViewSectionRef is negative', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rawViewSectionRef: -1
            }
          }
        ]
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'Table1'
        })
      ).rejects.toThrow('has no rawViewSectionRef')
    })

    it('provides helpful error message for missing table', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      await expect(
        owner.getOwnerRef(mockClient, 'doc123', {
          tableId: 'InvalidTable'
        })
      ).rejects.toThrow('Use grist_get_tables to list available tables')
    })
  })

  describe('getRulesAndStyles', () => {
    it('retrieves rules and styles from view section metadata', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '201,202,203',
              options: JSON.stringify({
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

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([201, 202, 203])
      expect(result.styles).toEqual([
        { fillColor: '#FF0000' },
        { fillColor: '#00FF00' },
        { fillColor: '#0000FF' }
      ])
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT rules, options'),
        args: [50]
      })
    })

    it('returns empty arrays when no rules exist', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '',
              options: '{}'
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('returns empty arrays when section not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([])
      expect(result.styles).toEqual([])
    })

    it('handles missing rulesOptions in options', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '201,202',
              options: JSON.stringify({ someOtherOption: true })
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([201, 202])
      expect(result.styles).toEqual([])
    })

    it('handles null options', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              rules: '201',
              options: null
            }
          }
        ]
      })

      const result = await owner.getRulesAndStyles(mockClient, 'doc123', 50)

      expect(result.helperColRefs).toEqual([201])
      expect(result.styles).toEqual([])
    })
  })

  describe('updateRulesAndStyles', () => {
    it('updates rules and styles preserving other options', async () => {
      // Mock getting current options
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: [
            {
              fields: {
                options: JSON.stringify({
                  sortSpec: ['Price'],
                  someOtherOption: true
                })
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 50, {
        helperColRefs: [201, 202],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      // First call: get current options
      expect(mockClient.post).toHaveBeenNthCalledWith(1, '/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT options'),
        args: [50]
      })

      // Second call: update with merged options
      expect(mockClient.post).toHaveBeenNthCalledWith(
        2,
        '/docs/doc123/apply',
        [
          [
            'UpdateRecord',
            '_grist_Views_section',
            50,
            {
              rules: JSON.stringify([201, 202]),
              options: expect.stringContaining('sortSpec')
            }
          ]
        ],
        expect.any(Object)
      )

      // Verify rulesOptions is included
      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const options = JSON.parse(applyCall[1][0][3].options)
      expect(options.rulesOptions).toEqual([{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }])
      expect(options.sortSpec).toEqual(['Price'])
      expect(options.someOtherOption).toBe(true)
    })

    it('handles empty current options', async () => {
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: []
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      await owner.updateRulesAndStyles(mockClient, 'doc123', 50, {
        helperColRefs: [201],
        styles: [{ fillColor: '#FF0000' }]
      })

      const applyCall = vi.mocked(mockClient.post).mock.calls[1]
      const options = JSON.parse(applyCall[1][0][3].options)
      expect(options.rulesOptions).toEqual([{ fillColor: '#FF0000' }])
    })

    it('validates apply response', async () => {
      const { validateRetValues } = await import('../../../../src/validators/apply-response.js')

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

  describe('getOptionsFresh', () => {
    it('retrieves fresh options via SQL', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              options: JSON.stringify({
                sortSpec: ['Price'],
                rulesOptions: [{ fillColor: '#FF0000' }]
              })
            }
          }
        ]
      })

      const result = await owner.getOptionsFresh(mockClient, 'doc123', 50)

      expect(result).toEqual({
        sortSpec: ['Price'],
        rulesOptions: [{ fillColor: '#FF0000' }]
      })
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT options'),
        args: [50]
      })
    })

    it('returns empty object when section not found', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await owner.getOptionsFresh(mockClient, 'doc123', 50)

      expect(result).toEqual({})
    })

    it('handles null options', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              options: null
            }
          }
        ]
      })

      const result = await owner.getOptionsFresh(mockClient, 'doc123', 50)

      expect(result).toEqual({})
    })
  })
})
