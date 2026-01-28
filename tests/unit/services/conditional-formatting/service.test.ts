import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConditionalFormattingService,
  createRuleOwner,
  RuleOwner
} from '../../../../src/services/conditional-formatting/service.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// Mock the rule-utilities module
vi.mock('../../../../src/services/rule-utilities.js', () => ({
  validatePythonFormula: vi.fn((formula: string) => {
    if (formula.includes('=') && !formula.includes('==')) {
      return { valid: false, error: 'Invalid equality operator' }
    }
    return { valid: true }
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
  parseStyleOptions: vi.fn((value) => {
    if (typeof value === 'string') {
      return JSON.parse(value)
    }
    return value
  })
}))

describe('createRuleOwner', () => {
  it('creates RuleOwner for column scope', () => {
    const owner = createRuleOwner('column')
    expect(owner).toBeInstanceOf(RuleOwner)
    expect(owner.scope).toBe('column')
  })

  it('creates RuleOwner for row scope', () => {
    const owner = createRuleOwner('row')
    expect(owner).toBeInstanceOf(RuleOwner)
    expect(owner.scope).toBe('row')
  })

  it('creates RuleOwner for field scope', () => {
    const owner = createRuleOwner('field')
    expect(owner).toBeInstanceOf(RuleOwner)
    expect(owner.scope).toBe('field')
  })
})

describe('ConditionalFormattingService', () => {
  let service: ConditionalFormattingService
  let mockClient: GristClient
  let mockRuleOwner: {
    getOwnerRef: ReturnType<typeof vi.fn>
    getRulesAndStyles: ReturnType<typeof vi.fn>
    updateRulesAndStyles: ReturnType<typeof vi.fn>
    predictNextHelperColId: ReturnType<typeof vi.fn>
    getHelperColumnFormulas: ReturnType<typeof vi.fn>
    getAddEmptyRuleParams: ReturnType<typeof vi.fn>
    config: {
      metadataTable: string
      styleProperty: string
      rulesProperty: string
      helperColumnPrefix: string
      stylesInWidgetOptions: boolean
    }
  }

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn()
    } as unknown as GristClient

    // Create service with column scope
    service = new ConditionalFormattingService(mockClient, 'column')

    // Mock the rule owner
    mockRuleOwner = {
      getOwnerRef: vi.fn().mockResolvedValue(100),
      getRulesAndStyles: vi.fn().mockResolvedValue({
        helperColRefs: [],
        styles: []
      }),
      updateRulesAndStyles: vi.fn().mockResolvedValue(undefined),
      predictNextHelperColId: vi.fn().mockResolvedValue('gristHelper_ConditionalRule'),
      getHelperColumnFormulas: vi.fn().mockResolvedValue([]),
      getAddEmptyRuleParams: vi.fn().mockReturnValue([0, 100]),
      config: {
        metadataTable: '_grist_Tables_column',
        styleProperty: 'widgetOptions',
        rulesProperty: 'rules',
        helperColumnPrefix: 'gristHelper_ConditionalRule',
        stylesInWidgetOptions: true
      }
    }

    // Replace the rule owner with mock for testing
    ;(service as unknown as { ruleOwner: typeof mockRuleOwner }).ruleOwner = mockRuleOwner
  })

  describe('addRule', () => {
    it('validates formula before adding', async () => {
      const { validatePythonFormula } = await import('../../../../src/services/rule-utilities.js')

      await expect(
        service.addRule(
          'doc123',
          'Table1',
          { tableId: 'Table1', colId: 'Status' },
          {
            formula: '$Status = "Active"', // Invalid - single =
            style: { fillColor: '#FF0000' }
          }
        )
      ).rejects.toThrow('Invalid formula')

      expect(validatePythonFormula).toHaveBeenCalledWith('$Status = "Active"')
    })

    it('adds a new rule successfully', async () => {
      // Mock SQL query for getOwnerOptions
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({
          records: [{ fields: { widgetOptions: '{}' } }]
        })
        .mockResolvedValueOnce({
          retValues: []
        })

      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({
          helperColRefs: [],
          styles: []
        })
        .mockResolvedValueOnce({
          helperColRefs: [101],
          styles: [{ fillColor: '#FF0000' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [101],
          styles: [{ fillColor: '#FF0000' }]
        })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100'])

      const result = await service.addRule(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        {
          formula: '$Price > 100',
          style: { fillColor: '#FF0000' }
        }
      )

      expect(mockRuleOwner.getOwnerRef).toHaveBeenCalledWith(mockClient, 'doc123', {
        tableId: 'Table1',
        colId: 'Price'
      })
      expect(mockRuleOwner.predictNextHelperColId).toHaveBeenCalledWith(
        mockClient,
        'doc123',
        'Table1'
      )
      // Check the apply call (second post call)
      expect(mockClient.post).toHaveBeenCalledWith(
        '/docs/doc123/apply',
        expect.arrayContaining([
          ['AddEmptyRule', 'Table1', 0, 100],
          ['ModifyColumn', 'Table1', 'gristHelper_ConditionalRule', { formula: '$Price > 100' }],
          [
            'UpdateRecord',
            '_grist_Tables_column',
            100,
            expect.objectContaining({
              widgetOptions: expect.stringContaining('fillColor')
            })
          ]
        ]),
        expect.any(Object)
      )
      expect(result.totalRules).toBe(1)
    })

    it('retries on column prediction failure', async () => {
      // First attempt: SQL query succeeds, apply fails
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockRejectedValueOnce(new Error('Invalid column not found'))
        // Second attempt: SQL query succeeds, apply succeeds
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockResolvedValueOnce({ retValues: [] })

      mockRuleOwner.predictNextHelperColId
        .mockResolvedValueOnce('gristHelper_ConditionalRule')
        .mockResolvedValueOnce('gristHelper_ConditionalRule2')

      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({ helperColRefs: [], styles: [] })
        .mockResolvedValueOnce({ helperColRefs: [], styles: [] })
        .mockResolvedValueOnce({ helperColRefs: [101], styles: [{ fillColor: '#FF0000' }] })
        .mockResolvedValueOnce({ helperColRefs: [101], styles: [{ fillColor: '#FF0000' }] })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100'])

      const result = await service.addRule(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        {
          formula: '$Price > 100',
          style: { fillColor: '#FF0000' }
        }
      )

      expect(mockClient.post).toHaveBeenCalledTimes(4) // 2 SQL queries + 2 applies
      expect(result.totalRules).toBe(1)
    })

    it('throws after max retries', async () => {
      // SQL queries succeed, but applies fail
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockRejectedValueOnce(new Error('Invalid column not found'))
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockRejectedValueOnce(new Error('Invalid column not found'))
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockRejectedValueOnce(new Error('Invalid column not found'))

      mockRuleOwner.predictNextHelperColId.mockResolvedValue('gristHelper_ConditionalRule')
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({ helperColRefs: [], styles: [] })

      await expect(
        service.addRule(
          'doc123',
          'Table1',
          { tableId: 'Table1', colId: 'Price' },
          {
            formula: '$Price > 100',
            style: { fillColor: '#FF0000' }
          }
        )
      ).rejects.toThrow('Invalid column not found')

      expect(mockClient.post).toHaveBeenCalledTimes(6) // 3 SQL queries + 3 failed applies
    })

    it('waits for rules RefList to propagate', async () => {
      // Mock SQL query and apply
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockResolvedValueOnce({ retValues: [] })

      // Simulate gradual propagation
      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({ helperColRefs: [], styles: [] }) // Initial state
        .mockResolvedValueOnce({ helperColRefs: [], styles: [] }) // Still propagating
        .mockResolvedValueOnce({ helperColRefs: [101], styles: [{ fillColor: '#FF0000' }] }) // Propagated
        .mockResolvedValueOnce({ helperColRefs: [101], styles: [{ fillColor: '#FF0000' }] }) // For listRules

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100'])

      const result = await service.addRule(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        {
          formula: '$Price > 100',
          style: { fillColor: '#FF0000' }
        }
      )

      expect(mockRuleOwner.getRulesAndStyles).toHaveBeenCalledTimes(4)
      expect(result.totalRules).toBe(1)
    })
  })

  describe('updateRule', () => {
    it('validates formula before updating', async () => {
      await expect(
        service.updateRule('doc123', 'Table1', { tableId: 'Table1', colId: 'Status' }, 0, {
          formula: '$Status = "Active"', // Invalid
          style: { fillColor: '#FF0000' }
        })
      ).rejects.toThrow('Invalid formula')
    })

    it('validates rule index', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      await expect(
        service.updateRule(
          'doc123',
          'Table1',
          { tableId: 'Table1', colId: 'Price' },
          5, // Invalid index
          {
            formula: '$Price > 200',
            style: { fillColor: '#0000FF' }
          }
        )
      ).rejects.toThrow('Invalid ruleIndex: 5')
    })

    it('updates formula and style successfully', async () => {
      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({
          helperColRefs: [101, 102],
          styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [101, 102],
          styles: [{ fillColor: '#0000FF' }, { fillColor: '#00FF00' }]
        })

      vi.mocked(mockClient.post).mockResolvedValue({ retValues: [] })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue([
        '$Price > 200',
        '$Status == "Active"'
      ])

      const result = await service.updateRule(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        0,
        {
          formula: '$Price > 200',
          style: { fillColor: '#0000FF' }
        }
      )

      // Check formula update
      expect(mockClient.post).toHaveBeenCalledWith(
        '/docs/doc123/apply',
        [['UpdateRecord', '_grist_Tables_column', 101, { formula: '$Price > 200' }]],
        expect.any(Object)
      )

      // Check style update
      expect(mockRuleOwner.updateRulesAndStyles).toHaveBeenCalledWith(mockClient, 'doc123', 100, {
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#0000FF' }, { fillColor: '#00FF00' }]
      })

      expect(result.totalRules).toBe(2)
    })
  })

  describe('removeRule', () => {
    it('validates rule index', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      await expect(
        service.removeRule('doc123', 'Table1', { tableId: 'Table1', colId: 'Price' }, 5)
      ).rejects.toThrow('Invalid ruleIndex: 5')
    })

    it('removes rule successfully', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102, 103],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }, { fillColor: '#0000FF' }]
      })

      const result = await service.removeRule(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        1 // Remove middle rule
      )

      expect(mockRuleOwner.updateRulesAndStyles).toHaveBeenCalledWith(mockClient, 'doc123', 100, {
        helperColRefs: [101, 103],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#0000FF' }]
      })

      expect(result.remainingRules).toBe(2)
      expect(result.message).toContain('Successfully removed rule 2')
    })
  })

  describe('replaceAllRules', () => {
    it('clears existing rules before adding new ones', async () => {
      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({
          helperColRefs: [101, 102],
          styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [],
          styles: []
        })
        .mockResolvedValueOnce({
          helperColRefs: [103],
          styles: [{ fillColor: '#0000FF' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [103],
          styles: [{ fillColor: '#0000FF' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [103],
          styles: [{ fillColor: '#0000FF' }]
        })

      // Mock SQL query for getOwnerOptions and apply
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockResolvedValueOnce({ retValues: [] })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 300'])

      const result = await service.replaceAllRules(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        [
          {
            formula: '$Price > 300',
            style: { fillColor: '#0000FF' }
          }
        ]
      )

      // Should clear first
      expect(mockRuleOwner.updateRulesAndStyles).toHaveBeenCalledWith(mockClient, 'doc123', 100, {
        helperColRefs: [],
        styles: []
      })

      expect(result.totalRules).toBe(1)
    })

    it('does not clear when no existing rules', async () => {
      mockRuleOwner.getRulesAndStyles
        .mockResolvedValueOnce({
          helperColRefs: [],
          styles: []
        })
        .mockResolvedValueOnce({
          helperColRefs: [],
          styles: []
        })
        .mockResolvedValueOnce({
          helperColRefs: [101],
          styles: [{ fillColor: '#0000FF' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [101],
          styles: [{ fillColor: '#0000FF' }]
        })
        .mockResolvedValueOnce({
          helperColRefs: [101],
          styles: [{ fillColor: '#0000FF' }]
        }) // For replaceAllRules.listRules

      // Mock SQL query for getOwnerOptions and apply
      vi.mocked(mockClient.post)
        .mockResolvedValueOnce({ records: [{ fields: { widgetOptions: '{}' } }] })
        .mockResolvedValueOnce({ retValues: [] })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 300'])

      const result = await service.replaceAllRules(
        'doc123',
        'Table1',
        { tableId: 'Table1', colId: 'Price' },
        [
          {
            formula: '$Price > 300',
            style: { fillColor: '#0000FF' }
          }
        ]
      )

      // Should not call update to clear (no existing rules)
      expect(mockRuleOwner.updateRulesAndStyles).not.toHaveBeenCalledWith(
        mockClient,
        'doc123',
        100,
        {
          helperColRefs: [],
          styles: []
        }
      )

      expect(result.totalRules).toBe(1)
    })
  })

  describe('listRules', () => {
    it('returns empty list when no rules exist', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [],
        styles: []
      })

      const result = await service.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result.rules).toEqual([])
      expect(result.totalRules).toBe(0)
      expect(result.scope).toBe('column')
      expect(result.target.tableId).toBe('Table1')
      expect(result.target.colId).toBe('Price')
    })

    it('lists all rules with formulas and styles', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100', '$Price > 200'])

      const result = await service.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result.rules).toHaveLength(2)
      expect(result.rules[0]).toEqual({
        index: 0,
        formula: '$Price > 100',
        style: { fillColor: '#FF0000' }
      })
      expect(result.rules[1]).toEqual({
        index: 1,
        formula: '$Price > 200',
        style: { fillColor: '#00FF00' }
      })
      expect(result.totalRules).toBe(2)
    })

    it('handles missing formulas gracefully', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }, { fillColor: '#00FF00' }]
      })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100', ''])

      const result = await service.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result.rules[1].formula).toBe('')
    })

    it('handles missing styles gracefully', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [101, 102],
        styles: [{ fillColor: '#FF0000' }] // Missing second style
      })

      mockRuleOwner.getHelperColumnFormulas.mockResolvedValue(['$Price > 100', '$Price > 200'])

      const result = await service.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result.rules[1].style).toEqual({})
    })
  })

  describe('target building', () => {
    it('builds target for column scope', async () => {
      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [],
        styles: []
      })

      const result = await service.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        colId: 'Price'
      })

      expect(result.target).toEqual({
        tableId: 'Table1',
        colId: 'Price'
      })
    })

    it('builds target for field scope', async () => {
      const fieldService = new ConditionalFormattingService(mockClient, 'field')
      ;(fieldService as unknown as { ruleOwner: typeof mockRuleOwner }).ruleOwner = mockRuleOwner

      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [],
        styles: []
      })

      const result = await fieldService.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        fieldColId: 'Price',
        sectionId: 5
      })

      expect(result.target).toEqual({
        tableId: 'Table1',
        colId: 'Price',
        sectionId: 5,
        fieldId: 100
      })
    })

    it('builds target for row scope', async () => {
      const rowService = new ConditionalFormattingService(mockClient, 'row')
      ;(rowService as unknown as { ruleOwner: typeof mockRuleOwner }).ruleOwner = mockRuleOwner

      mockRuleOwner.getRulesAndStyles.mockResolvedValue({
        helperColRefs: [],
        styles: []
      })

      const result = await rowService.listRules('doc123', 'Table1', {
        tableId: 'Table1',
        sectionId: 5
      })

      expect(result.target).toEqual({
        tableId: 'Table1',
        sectionId: 5
      })
    })
  })
})
