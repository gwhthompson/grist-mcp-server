import { describe, expect, it } from 'vitest'
import { DataIntegrityError } from '../../../src/errors/DataIntegrityError.js'

describe('DataIntegrityError', () => {
  describe('invalid_reference', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People'
        })
        expect(error.kind).toBe('invalid_reference')
        expect(error.details.columnId).toBe('PersonRef')
        expect(error.details.value).toBe(999)
        expect(error.details.refTableId).toBe('People')
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('INVALID_REFERENCE')
      })

      it('includes validRowIds when provided', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People',
          validRowIds: [1, 2, 3]
        })
        expect(error.details.validRowIds).toEqual([1, 2, 3])
      })

      it('message includes valid IDs when <= 10', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People',
          validRowIds: [1, 2, 3, 4, 5]
        })
        expect(error.message).toContain('Valid IDs: [1, 2, 3, 4, 5]')
      })

      it('message shows count when > 10 valid IDs', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People',
          validRowIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        })
        expect(error.message).toContain('11 valid IDs exist')
        expect(error.message).not.toContain('[1,')
      })

      it('message has no hint when validRowIds not provided', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People'
        })
        expect(error.message).not.toContain('Valid IDs')
        expect(error.message).not.toContain('valid IDs exist')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People'
        })
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('includes column name, value, and ref table', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People'
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('PersonRef')
        expect(msg).toContain('999')
        expect(msg).toContain('People')
      })

      it('shows valid IDs when <= 20', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People',
          validRowIds: [1, 2, 3, 4, 5]
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('Valid row IDs in "People": [1, 2, 3, 4, 5]')
      })

      it('shows row count when > 20 valid IDs', () => {
        const validIds = Array.from({ length: 25 }, (_, i) => i + 1)
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People',
          validRowIds: validIds
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('Table "People" has 25 rows')
        expect(msg).not.toContain('[1, 2, 3')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new DataIntegrityError('invalid_reference', 'Tasks', {
          columnId: 'PersonRef',
          value: 999,
          refTableId: 'People'
        })
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('People')
        expect(suggestions[2]).toContain('0 to clear')
      })
    })
  })

  describe('invalid_reflist', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [100, 200],
          refTableId: 'TagsTable'
        })
        expect(error.kind).toBe('invalid_reflist')
        expect(error.details.columnId).toBe('Tags')
        expect(error.details.invalidValues).toEqual([100, 200])
        expect(error.details.refTableId).toBe('TagsTable')
        expect(error.tableId).toBe('Items')
        expect(error.code).toBe('INVALID_REFLIST')
      })

      it('truncates invalid values at 5 in message', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [1, 2, 3, 4, 5, 6, 7],
          refTableId: 'TagsTable'
        })
        expect(error.message).toContain('[1, 2, 3, 4, 5 and 2 more]')
      })

      it('shows all values when <= 5', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [1, 2, 3],
          refTableId: 'TagsTable'
        })
        expect(error.message).toContain('[1, 2, 3]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [100],
          refTableId: 'TagsTable'
        })
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('truncates at 10 in user message', () => {
        const invalidIds = Array.from({ length: 15 }, (_, i) => i + 100)
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: invalidIds,
          refTableId: 'TagsTable'
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('100, 101, 102, 103, 104, 105, 106, 107, 108, 109 and 5 more')
      })

      it('shows all when <= 10', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [1, 2, 3],
          refTableId: 'TagsTable'
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('[1, 2, 3]')
        expect(msg).not.toContain('more')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new DataIntegrityError('invalid_reflist', 'Items', {
          columnId: 'Tags',
          invalidValues: [100],
          refTableId: 'TagsTable'
        })
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('TagsTable')
        expect(suggestions[2]).toContain('empty array')
      })
    })
  })

  describe('invalid_choice', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'Invalid',
          allowedChoices: ['Active', 'Inactive']
        })
        expect(error.kind).toBe('invalid_choice')
        expect(error.details.columnId).toBe('Status')
        expect(error.details.value).toBe('Invalid')
        expect(error.details.allowedChoices).toEqual(['Active', 'Inactive'])
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('INVALID_CHOICE')
      })

      it('shows choices in message when <= 10', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: ['A', 'B', 'C']
        })
        expect(error.message).toContain('["A", "B", "C"]')
      })

      it('shows choice count when > 10', () => {
        const choices = Array.from({ length: 15 }, (_, i) => `Choice${i}`)
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: choices
        })
        expect(error.message).toContain('15 choices defined')
        expect(error.message).not.toContain('Choice0')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: ['A']
        })
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('shows all choices when <= 20', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'Bad',
          allowedChoices: ['Active', 'Inactive', 'Pending']
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('"Active", "Inactive", "Pending"')
      })

      it('truncates at 20 choices', () => {
        const choices = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'Bad',
          allowedChoices: choices
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })
    })

    describe('getSuggestions', () => {
      it('includes valid choices when <= 20', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: ['A', 'B', 'C']
        })
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).toContain('"A", "B", "C"')
      })

      it('omits valid choices when > 20', () => {
        const choices = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: choices
        })
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).not.toContain('Valid choices')
        expect(suggestions[0]).toContain('grist_get_tables')
      })

      it('suggests how to add new choices', () => {
        const error = new DataIntegrityError('invalid_choice', 'Tasks', {
          columnId: 'Status',
          value: 'X',
          allowedChoices: ['A']
        })
        const suggestions = error.getSuggestions()
        expect(suggestions.some((s) => s.includes('grist_manage_columns'))).toBe(true)
      })
    })
  })

  describe('invalid_choicelist', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['Bad1', 'Bad2'],
          allowedChoices: ['Good1', 'Good2']
        })
        expect(error.kind).toBe('invalid_choicelist')
        expect(error.details.columnId).toBe('Tags')
        expect(error.details.invalidValues).toEqual(['Bad1', 'Bad2'])
        expect(error.details.allowedChoices).toEqual(['Good1', 'Good2'])
        expect(error.tableId).toBe('Items')
        expect(error.code).toBe('INVALID_CHOICELIST')
      })

      it('truncates invalid values at 5 in message', () => {
        const invalid = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: invalid,
          allowedChoices: ['Valid']
        })
        expect(error.message).toContain('"A", "B", "C", "D", "E" and 2 more')
      })

      it('shows all invalid values when <= 5', () => {
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['A', 'B', 'C'],
          allowedChoices: ['Valid']
        })
        expect(error.message).toContain('["A", "B", "C"]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['Bad'],
          allowedChoices: ['Good']
        })
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('truncates invalid values at 10', () => {
        const invalid = Array.from({ length: 15 }, (_, i) => `Bad${i}`)
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: invalid,
          allowedChoices: ['Good']
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })

      it('truncates allowed choices at 20', () => {
        const allowed = Array.from({ length: 25 }, (_, i) => `Good${i}`)
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['Bad'],
          allowedChoices: allowed
        })
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })
    })

    describe('getSuggestions', () => {
      it('includes valid choices when <= 20', () => {
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['X'],
          allowedChoices: ['A', 'B', 'C']
        })
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).toContain('"A", "B", "C"')
      })

      it('omits valid choices when > 20', () => {
        const allowed = Array.from({ length: 25 }, (_, i) => `C${i}`)
        const error = new DataIntegrityError('invalid_choicelist', 'Items', {
          columnId: 'Tags',
          invalidValues: ['X'],
          allowedChoices: allowed
        })
        const suggestions = error.getSuggestions()
        expect(suggestions[0]).not.toContain('Valid choices')
      })
    })
  })

  describe('row_not_found', () => {
    describe('constructor', () => {
      it('creates error with correct properties', () => {
        const error = new DataIntegrityError('row_not_found', 'Tasks', {
          rowIds: [1, 2, 3]
        })
        expect(error.kind).toBe('row_not_found')
        expect(error.details.rowIds).toEqual([1, 2, 3])
        expect(error.tableId).toBe('Tasks')
        expect(error.code).toBe('ROW_NOT_FOUND')
      })

      it('truncates at 10 row IDs in message', () => {
        const rowIds = Array.from({ length: 15 }, (_, i) => i + 1)
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds })
        expect(error.message).toContain('1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 5 more')
      })

      it('shows all row IDs when <= 10', () => {
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds: [1, 2, 3] })
        expect(error.message).toContain('[1, 2, 3]')
        expect(error.message).not.toContain('more')
      })
    })

    describe('isRetryable', () => {
      it('returns false', () => {
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds: [1] })
        expect(error.isRetryable()).toBe(false)
      })
    })

    describe('toUserMessage', () => {
      it('includes table name', () => {
        const error = new DataIntegrityError('row_not_found', 'MyTable', { rowIds: [1] })
        const msg = error.toUserMessage()
        expect(msg).toContain('MyTable')
      })

      it('truncates at 20 row IDs', () => {
        const rowIds = Array.from({ length: 25 }, (_, i) => i + 1)
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds })
        const msg = error.toUserMessage()
        expect(msg).toContain('and 5 more')
      })

      it('mentions deletion as possible cause', () => {
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds: [1] })
        const msg = error.toUserMessage()
        expect(msg).toContain('deleted')
      })
    })

    describe('getSuggestions', () => {
      it('returns actionable suggestions', () => {
        const error = new DataIntegrityError('row_not_found', 'Tasks', { rowIds: [1] })
        const suggestions = error.getSuggestions()
        expect(suggestions.length).toBe(3)
        expect(suggestions[0]).toContain('grist_get_records')
        expect(suggestions[0]).toContain('Tasks')
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty validRowIds array', () => {
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 1,
        refTableId: 'Table',
        validRowIds: []
      })
      expect(error.details.validRowIds).toEqual([])
      const msg = error.toUserMessage()
      // Empty array shows the valid IDs section with empty brackets
      expect(msg).toContain('Valid row IDs in "Table": []')
    })

    it('handles single invalid value in RefList', () => {
      const error = new DataIntegrityError('invalid_reflist', 'Source', {
        columnId: 'Refs',
        invalidValues: [999],
        refTableId: 'Table'
      })
      expect(error.message).toContain('[999]')
    })

    it('handles single choice', () => {
      const error = new DataIntegrityError('invalid_choice', 'Table', {
        columnId: 'Status',
        value: 'Bad',
        allowedChoices: ['Good']
      })
      expect(error.message).toContain('["Good"]')
    })

    it('handles empty choice list', () => {
      const error = new DataIntegrityError('invalid_choice', 'Table', {
        columnId: 'Status',
        value: 'Bad',
        allowedChoices: []
      })
      const suggestions = error.getSuggestions()
      expect(suggestions[0]).toContain('Valid choices:')
    })

    it('handles exactly 10 items (boundary)', () => {
      const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 999,
        refTableId: 'Table',
        validRowIds: validIds
      })
      expect(error.message).toContain('Valid IDs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]')
      expect(error.message).not.toContain('valid IDs exist')
    })

    it('handles exactly 11 items (boundary)', () => {
      const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 999,
        refTableId: 'Table',
        validRowIds: validIds
      })
      expect(error.message).toContain('11 valid IDs exist')
    })

    it('handles exactly 20 items in toUserMessage (boundary)', () => {
      const validIds = Array.from({ length: 20 }, (_, i) => i + 1)
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 999,
        refTableId: 'Table',
        validRowIds: validIds
      })
      const msg = error.toUserMessage()
      expect(msg).toContain('Valid row IDs')
      expect(msg).toContain('20]')
      expect(msg).not.toContain('has 20 rows')
    })

    it('handles exactly 21 items in toUserMessage (boundary)', () => {
      const validIds = Array.from({ length: 21 }, (_, i) => i + 1)
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 999,
        refTableId: 'Table',
        validRowIds: validIds
      })
      const msg = error.toUserMessage()
      expect(msg).toContain('has 21 rows')
    })

    it('handles exactly 5 items in RefList message (boundary)', () => {
      const error = new DataIntegrityError('invalid_reflist', 'Source', {
        columnId: 'Refs',
        invalidValues: [1, 2, 3, 4, 5],
        refTableId: 'Table'
      })
      expect(error.message).toContain('[1, 2, 3, 4, 5]')
      expect(error.message).not.toContain('more')
    })

    it('handles exactly 6 items in RefList message (boundary)', () => {
      const error = new DataIntegrityError('invalid_reflist', 'Source', {
        columnId: 'Refs',
        invalidValues: [1, 2, 3, 4, 5, 6],
        refTableId: 'Table'
      })
      expect(error.message).toContain('[1, 2, 3, 4, 5 and 1 more]')
    })
  })

  describe('context object', () => {
    it('invalid_reference includes context', () => {
      const error = new DataIntegrityError('invalid_reference', 'Source', {
        columnId: 'Ref',
        value: 999,
        refTableId: 'RefTable',
        validRowIds: [1, 2]
      })
      expect(error.context).toMatchObject({
        columnId: 'Ref',
        value: 999,
        refTableId: 'RefTable',
        tableId: 'Source'
      })
    })

    it('invalid_reflist includes context', () => {
      const error = new DataIntegrityError('invalid_reflist', 'Source', {
        columnId: 'Refs',
        invalidValues: [100, 200],
        refTableId: 'RefTable',
        validRowIds: [1, 2, 3]
      })
      expect(error.context).toMatchObject({
        columnId: 'Refs',
        invalidValues: [100, 200],
        refTableId: 'RefTable',
        tableId: 'Source'
      })
    })

    it('invalid_choice includes context', () => {
      const error = new DataIntegrityError('invalid_choice', 'Table', {
        columnId: 'Status',
        value: 'Bad',
        allowedChoices: ['A', 'B']
      })
      expect(error.context).toMatchObject({
        columnId: 'Status',
        value: 'Bad',
        allowedChoices: ['A', 'B'],
        tableId: 'Table'
      })
    })

    it('invalid_choicelist includes context', () => {
      const error = new DataIntegrityError('invalid_choicelist', 'Table', {
        columnId: 'Tags',
        invalidValues: ['X', 'Y'],
        allowedChoices: ['A', 'B']
      })
      expect(error.context).toMatchObject({
        columnId: 'Tags',
        invalidValues: ['X', 'Y'],
        allowedChoices: ['A', 'B'],
        tableId: 'Table'
      })
    })

    it('row_not_found includes context', () => {
      const error = new DataIntegrityError('row_not_found', 'Table', {
        rowIds: [1, 2, 3]
      })
      expect(error.context).toMatchObject({
        rowIds: [1, 2, 3],
        tableId: 'Table'
      })
    })
  })
})
