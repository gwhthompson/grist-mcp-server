import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleOwner } from '../../../../src/services/conditional-formatting/rule-owner.js'
import type {
  OwnerLookupParams,
  RuleContext,
  RuleOwnerConfig,
  RulesAndStyles,
  RulesAndStylesUpdate
} from '../../../../src/services/conditional-formatting/types.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// Concrete implementation for testing
class TestRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Tables_column',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule'
  }

  getAddEmptyRuleParams(_context: RuleContext): [number, number] {
    return [0, 123]
  }

  async getOwnerRef(
    _client: GristClient,
    _docId: string,
    _params: OwnerLookupParams
  ): Promise<number> {
    return 456
  }

  async getRulesAndStyles(
    _client: GristClient,
    _docId: string,
    _ownerRef: number
  ): Promise<RulesAndStyles> {
    return { helperColRefs: [1, 2, 3], styles: [{ fillColor: '#FF0000' }] }
  }

  async updateRulesAndStyles(
    _client: GristClient,
    _docId: string,
    _ownerRef: number,
    _update: RulesAndStylesUpdate
  ): Promise<void> {
    // Test implementation - no-op
  }
}

describe('RuleOwner', () => {
  let ruleOwner: TestRuleOwner
  let mockClient: GristClient

  beforeEach(() => {
    ruleOwner = new TestRuleOwner()
    mockClient = {
      post: vi.fn(),
      get: vi.fn()
    } as unknown as GristClient
  })

  describe('predictNextHelperColId', () => {
    it('returns base name when no helpers exist', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: []
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule')
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
        sql: expect.stringContaining('SELECT c.colId'),
        args: ['Table1', 'gristHelper_ConditionalRule%']
      })
    })

    it('returns base name when it is not taken (gap in numbering)', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { colId: 'gristHelper_ConditionalRule2' } },
          { fields: { colId: 'gristHelper_ConditionalRule3' } }
        ]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule')
    })

    it('returns numbered variant when base name is taken', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { colId: 'gristHelper_ConditionalRule' } }]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule2')
    })

    it('returns next available number when multiple helpers exist', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { colId: 'gristHelper_ConditionalRule' } },
          { fields: { colId: 'gristHelper_ConditionalRule2' } },
          { fields: { colId: 'gristHelper_ConditionalRule3' } }
        ]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule4')
    })

    it('handles case-insensitive matching (uppercase stored values)', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { colId: 'GRISTHELPER_CONDITIONALRULE' } }]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule2')
    })

    it('handles colId at top level (not in fields)', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ colId: 'gristHelper_ConditionalRule' }]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule2')
    })

    it('ignores non-string colId values', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { colId: 123 } }, // Invalid - number
          { fields: { colId: null } }, // Invalid - null
          { fields: { colId: 'gristHelper_ConditionalRule' } }
        ]
      })

      const result = await ruleOwner.predictNextHelperColId(mockClient, 'doc123', 'Table1')

      expect(result).toBe('gristHelper_ConditionalRule2')
    })
  })

  describe('getHelperColumnFormulas', () => {
    it('returns empty array for empty input', async () => {
      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [])

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

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', '$Status == "Active"'])
      expect(mockClient.get).toHaveBeenCalledWith(
        '/docs/doc123/tables/_grist_Tables_column/records',
        expect.objectContaining({
          params: expect.objectContaining({ _: expect.any(String) })
        })
      )
    })

    it('handles formula at top level (not in fields)', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, formula: '$Price > 100' },
          { id: 20, formula: '$Status == "Active"' }
        ]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', '$Status == "Active"'])
    })

    it('maintains order matching helperColRefs', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 20, fields: { formula: 'second' } },
          { id: 10, fields: { formula: 'first' } },
          { id: 30, fields: { formula: 'third' } }
        ]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20, 30])

      expect(result).toEqual(['first', 'second', 'third'])
    })

    it('returns empty string for missing formula', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: null } }
        ]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', ''])
    })

    it('returns empty string for missing colRef', async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        records: [{ id: 10, fields: { formula: '$Price > 100' } }]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 999])

      expect(result).toEqual(['$Price > 100', ''])
    })

    it('retries until all formulas are populated', async () => {
      // First call - missing formula for colRef 20
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: '' } } // Empty formula
        ]
      })

      // Second call - all formulas present
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [
          { id: 10, fields: { formula: '$Price > 100' } },
          { id: 20, fields: { formula: '$Status == "Active"' } }
        ]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

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

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10, 20])

      expect(result).toEqual(['$Price > 100', '$Status == "Active"'])
      expect(mockClient.get).toHaveBeenCalledTimes(1)
    })

    it('handles null formula values during retry', async () => {
      // First call - null formula
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [{ id: 10, fields: { formula: null } }]
      })

      // Second call - formula populated
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [{ id: 10, fields: { formula: '$Price > 100' } }]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10])

      expect(result).toEqual(['$Price > 100'])
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })

    it('handles undefined formula values during retry', async () => {
      // First call - undefined formula
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [{ id: 10, fields: {} }]
      })

      // Second call - formula populated
      vi.mocked(mockClient.get).mockResolvedValueOnce({
        records: [{ id: 10, fields: { formula: '$Price > 100' } }]
      })

      const result = await ruleOwner.getHelperColumnFormulas(mockClient, 'doc123', [10])

      expect(result).toEqual(['$Price > 100'])
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('abstract methods', () => {
    it('implements all required abstract methods', () => {
      expect(typeof ruleOwner.getAddEmptyRuleParams).toBe('function')
      expect(typeof ruleOwner.getOwnerRef).toBe('function')
      expect(typeof ruleOwner.getRulesAndStyles).toBe('function')
      expect(typeof ruleOwner.updateRulesAndStyles).toBe('function')
    })

    it('has config property', () => {
      expect(ruleOwner.config).toBeDefined()
      expect(ruleOwner.config.metadataTable).toBe('_grist_Tables_column')
      expect(ruleOwner.config.helperColumnPrefix).toBe('gristHelper_ConditionalRule')
    })
  })
})
