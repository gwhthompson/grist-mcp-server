import { describe, expect, it } from 'vitest'
import {
  InvalidChoiceError,
  InvalidChoiceListError,
  InvalidReferenceError,
  InvalidRefListError,
  RowNotFoundError
} from '../../../src/errors/DataIntegrityError.js'

describe('DataIntegrityError classes', () => {
  describe('InvalidReferenceError', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks')
        expect(error.columnId).toBe('PersonRef')
        expect(error.value).toBe(999)
        expect(error.refTableId).toBe('People')
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('INVALID_REFERENCE')
      })

      it('includes validRowIds when provided', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks', [1, 2, 3])
        expect(error.validRowIds).toEqual([1, 2, 3])
      })

      it('message includes valid IDs when <= 10', () => {
        const validIds = [1, 2, 3, 4, 5]
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks', validIds)
        expect(error.message).toContain('Valid IDs: [1, 2, 3, 4, 5]')
      })

      it('message shows count when > 10 valid IDs', () => {
        const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks', validIds)
        expect(error.message).toContain('11 valid IDs exist')
        expect(error.message).not.toContain('[1,')
      })

      it('message has no hint when validRowIds not provided', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks')
        expect(error.message).not.toContain('Valid IDs')
        expect(error.message).not.toContain('valid IDs exist')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks')
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('includes column name, value, and ref table', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks')
        const msg = error.toUserMessage()
        expect(msg).toContain('PersonRef')
        expect(msg).toContain('999')
        expect(msg).toContain('People')
      })

      it('shows valid IDs when <= 20', () => {
        const validIds = [1, 2, 3, 4, 5]
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks', validIds)
        const msg = error.toUserMessage()
        expect(msg).toContain('Valid row IDs in "People": [1, 2, 3, 4, 5]')
      })

      it('shows row count when > 20 valid IDs', () => {
        const validIds = Array.from({ length: 25 }, (_, i) => i + 1)
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks', validIds)
        const msg = error.toUserMessage()
        expect(msg).toContain('Table "People" has 25 rows')
        expect(msg).not.toContain('[1, 2, 3')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new InvalidReferenceError('PersonRef', 999, 'People', 'Tasks')
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('People')
        expect(suggestions[2]).toContain('0 to clear')
      })
    })
  })

  describe('InvalidRefListError', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new InvalidRefListError('Tags', [100, 200], 'TagsTable', 'Items')
        expect(error.columnId).toBe('Tags')
        expect(error.invalidValues).toEqual([100, 200])
        expect(error.refTableId).toBe('TagsTable')
        expect(error.tableId).toBe('Items')
        expect(error.code).toBe('INVALID_REFLIST')
      })

      it('truncates invalid values at 5 in message', () => {
        const invalidIds = [1, 2, 3, 4, 5, 6, 7]
        const error = new InvalidRefListError('Tags', invalidIds, 'TagsTable', 'Items')
        expect(error.message).toContain('[1, 2, 3, 4, 5 and 2 more]')
      })

      it('shows all values when <= 5', () => {
        const invalidIds = [1, 2, 3]
        const error = new InvalidRefListError('Tags', invalidIds, 'TagsTable', 'Items')
        expect(error.message).toContain('[1, 2, 3]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new InvalidRefListError('Tags', [100], 'TagsTable', 'Items')
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('truncates at 10 in user message', () => {
        const invalidIds = Array.from({ length: 15 }, (_, i) => i + 100)
        const error = new InvalidRefListError('Tags', invalidIds, 'TagsTable', 'Items')
        const msg = error.toUserMessage()
        expect(msg).toContain('100, 101, 102, 103, 104, 105, 106, 107, 108, 109 and 5 more')
      })

      it('shows all when <= 10', () => {
        const invalidIds = [1, 2, 3]
        const error = new InvalidRefListError('Tags', invalidIds, 'TagsTable', 'Items')
        const msg = error.toUserMessage()
        expect(msg).toContain('[1, 2, 3]')
        expect(msg).not.toContain('more')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new InvalidRefListError('Tags', [100], 'TagsTable', 'Items')
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('TagsTable')
        expect(suggestions[2]).toContain('empty array')
      })
    })
  })

  describe('InvalidChoiceError', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new InvalidChoiceError('Status', 'Invalid', ['Active', 'Inactive'], 'Tasks')
        expect(error.columnId).toBe('Status')
        expect(error.value).toBe('Invalid')
        expect(error.allowedChoices).toEqual(['Active', 'Inactive'])
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('INVALID_CHOICE')
      })

      it('shows choices in message when <= 10', () => {
        const choices = ['A', 'B', 'C']
        const error = new InvalidChoiceError('Status', 'X', choices, 'Tasks')
        expect(error.message).toContain('["A", "B", "C"]')
      })

      it('shows choice count when > 10', () => {
        const choices = Array.from({ length: 15 }, (_, i) => `Choice${i}`)
        const error = new InvalidChoiceError('Status', 'X', choices, 'Tasks')
        expect(error.message).toContain('15 choices defined')
        expect(error.message).not.toContain('Choice0')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new InvalidChoiceError('Status', 'X', ['A'], 'Tasks')
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('shows all choices when <= 20', () => {
        const choices = ['Active', 'Inactive', 'Pending']
        const error = new InvalidChoiceError('Status', 'Bad', choices, 'Tasks')
        const msg = error.toUserMessage()
        expect(msg).toContain('"Active", "Inactive", "Pending"')
      })

      it('truncates at 20 choices', () => {
        const choices = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new InvalidChoiceError('Status', 'Bad', choices, 'Tasks')
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })
    })

    describe('getSuggestions', () => {
      it('includes valid choices when <= 20', () => {
        const choices = ['A', 'B', 'C']
        const error = new InvalidChoiceError('Status', 'X', choices, 'Tasks')
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).toContain('"A", "B", "C"')
      })

      it('omits valid choices when > 20', () => {
        const choices = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new InvalidChoiceError('Status', 'X', choices, 'Tasks')
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).not.toContain('Valid choices')
        expect(suggestions[0]).toContain('grist_get_tables')
      })

      it('suggests how to add new choices', () => {
        const error = new InvalidChoiceError('Status', 'X', ['A'], 'Tasks')
        const suggestions = error.getSuggestions()
        expect(suggestions.some((s) => s.includes('grist_manage_columns'))).toBe(true)
      })
    })
  })

  describe('InvalidChoiceListError', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new InvalidChoiceListError(
          'Tags',
          ['Bad1', 'Bad2'],
          ['Good1', 'Good2'],
          'Items'
        )
        expect(error.columnId).toBe('Tags')
        expect(error.invalidValues).toEqual(['Bad1', 'Bad2'])
        expect(error.allowedChoices).toEqual(['Good1', 'Good2'])
        expect(error.tableId).toBe('Items')
        expect(error.code).toBe('INVALID_CHOICELIST')
      })

      it('truncates invalid values at 5 in message', () => {
        const invalid = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        const error = new InvalidChoiceListError('Tags', invalid, ['Valid'], 'Items')
        expect(error.message).toContain('"A", "B", "C", "D", "E" and 2 more')
      })

      it('shows all invalid values when <= 5', () => {
        const invalid = ['A', 'B', 'C']
        const error = new InvalidChoiceListError('Tags', invalid, ['Valid'], 'Items')
        expect(error.message).toContain('["A", "B", "C"]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new InvalidChoiceListError('Tags', ['Bad'], ['Good'], 'Items')
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('truncates invalid values at 10', () => {
        const invalid = Array.from({ length: 15 }, (_, i) => `Bad${i}`)
        const error = new InvalidChoiceListError('Tags', invalid, ['Good'], 'Items')
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })

      it('truncates allowed choices at 20', () => {
        const allowed = Array.from({ length: 25 }, (_, i) => `Good${i}`)
        const error = new InvalidChoiceListError('Tags', ['Bad'], allowed, 'Items')
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })
    })

    describe('getSuggestions', () => {
      it('includes valid choices when <= 20', () => {
        const allowed = ['A', 'B', 'C']
        const error = new InvalidChoiceListError('Tags', ['X'], allowed, 'Items')
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).toContain('"A", "B", "C"')
      })

      it('omits valid choices when > 20', () => {
        const allowed = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new InvalidChoiceListError('Tags', ['X'], allowed, 'Items')
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).not.toContain('Valid choices')
      })
    })
  })

  describe('RowNotFoundError', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new RowNotFoundError([1, 2, 3], 'Tasks')
        expect(error.rowIds).toEqual([1, 2, 3])
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('ROW_NOT_FOUND')
      })

      it('truncates at 10 row IDs in message', () => {
        const rowIds = Array.from({ length: 15 }, (_, i) => i + 1)
        const error = new RowNotFoundError(rowIds, 'Tasks')
        expect(error.message).toContain('1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 5 more')
      })

      it('shows all row IDs when <= 10', () => {
        const error = new RowNotFoundError([1, 2, 3], 'Tasks')
        expect(error.message).toContain('[1, 2, 3]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new RowNotFoundError([1], 'Tasks')
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('includes table name', () => {
        const error = new RowNotFoundError([1], 'MyTable')
        const msg = error.toUserMessage()
        expect(msg).toContain('MyTable')
      })

      it('truncates at 20 row IDs', () => {
        const rowIds = Array.from({ length: 25 }, (_, i) => i + 1)
        const error = new RowNotFoundError(rowIds, 'Tasks')
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })

      it('mentions deletion as possible cause', () => {
        const error = new RowNotFoundError([1], 'Tasks')
        const msg = error.toUserMessage()
        expect(msg).toContain('deleted')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new RowNotFoundError([1], 'Tasks')
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('Tasks')
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty validRowIds array', () => {
      const error = new InvalidReferenceError('Ref', 1, 'Table', 'Source', [])
      expect(error.validRowIds).toEqual([])
      const msg = error.toUserMessage()
      // Empty array shows the valid IDs section with empty brackets
      expect(msg).toContain('Valid row IDs in "Table": []')
    })

    it('handles single invalid value in RefList', () => {
      const error = new InvalidRefListError('Refs', [999], 'Table', 'Source')
      expect(error.message).toContain('[999]')
    })

    it('handles single choice', () => {
      const error = new InvalidChoiceError('Status', 'Bad', ['Good'], 'Table')
      expect(error.message).toContain('["Good"]')
    })

    it('handles empty choice list', () => {
      const error = new InvalidChoiceError('Status', 'Bad', [], 'Table')
      const suggestions = error.getSuggestions()
      expect(suggestions[0]).toContain('Valid choices:')
    })

    it('handles exactly 10 items (boundary)', () => {
      const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const error = new InvalidReferenceError('Ref', 999, 'Table', 'Source', validIds)
      expect(error.message).toContain('Valid IDs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]')
      expect(error.message).not.toContain('valid IDs exist')
    })

    it('handles exactly 11 items (boundary)', () => {
      const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      const error = new InvalidReferenceError('Ref', 999, 'Table', 'Source', validIds)
      expect(error.message).toContain('11 valid IDs exist')
    })

    it('handles exactly 20 items in toUserMessage (boundary)', () => {
      const validIds = Array.from({ length: 20 }, (_, i) => i + 1)
      const error = new InvalidReferenceError('Ref', 999, 'Table', 'Source', validIds)
      const msg = error.toUserMessage()
      expect(msg).toContain('Valid row IDs')
      expect(msg).toContain('20]')
      expect(msg).not.toContain('has 20 rows')
    })

    it('handles exactly 21 items in toUserMessage (boundary)', () => {
      const validIds = Array.from({ length: 21 }, (_, i) => i + 1)
      const error = new InvalidReferenceError('Ref', 999, 'Table', 'Source', validIds)
      const msg = error.toUserMessage()
      expect(msg).toContain('has 21 rows')
    })

    it('handles exactly 5 items in RefList message (boundary)', () => {
      const error = new InvalidRefListError('Refs', [1, 2, 3, 4, 5], 'Table', 'Source')
      expect(error.message).toContain('[1, 2, 3, 4, 5]')
      expect(error.message).not.toContain('more')
    })

    it('handles exactly 6 items in RefList message (boundary)', () => {
      const error = new InvalidRefListError('Refs', [1, 2, 3, 4, 5, 6], 'Table', 'Source')
      expect(error.message).toContain('[1, 2, 3, 4, 5 and 1 more]')
    })
  })

  describe('context object', () => {
    it('InvalidReferenceError includes context', () => {
      const error = new InvalidReferenceError('Ref', 999, 'RefTable', 'Source', [1, 2])
      expect(error.context).toMatchObject({
        columnId: 'Ref',
        value: 999,
        refTableId: 'RefTable',
        tableId: 'Source',
        validRowIdsCount: 2
      })
    })

    it('InvalidRefListError includes context', () => {
      const error = new InvalidRefListError('Refs', [100, 200], 'RefTable', 'Source', [1, 2, 3])
      expect(error.context).toMatchObject({
        columnId: 'Refs',
        invalidValues: [100, 200],
        refTableId: 'RefTable',
        tableId: 'Source',
        invalidCount: 2,
        validRowIdsCount: 3
      })
    })

    it('InvalidChoiceError includes context', () => {
      const error = new InvalidChoiceError('Status', 'Bad', ['A', 'B'], 'Table')
      expect(error.context).toMatchObject({
        columnId: 'Status',
        value: 'Bad',
        allowedChoices: ['A', 'B'],
        tableId: 'Table'
      })
    })

    it('InvalidChoiceListError includes context', () => {
      const error = new InvalidChoiceListError('Tags', ['X', 'Y'], ['A', 'B'], 'Table')
      expect(error.context).toMatchObject({
        columnId: 'Tags',
        invalidValues: ['X', 'Y'],
        allowedChoices: ['A', 'B'],
        tableId: 'Table',
        invalidCount: 2
      })
    })

    it('RowNotFoundError includes context', () => {
      const error = new RowNotFoundError([1, 2, 3], 'Table')
      expect(error.context).toMatchObject({
        rowIds: [1, 2, 3],
        tableId: 'Table',
        invalidCount: 3
      })
    })
  })
})
