/**
 * Regression tests for tool schema JSON conversion
 *
 * Ensures all tool inputSchemas can be converted to JSON Schema without error.
 * This catches issues like transforms that can't be represented in JSON Schema.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ALL_TOOLS } from '../../src/registry/tool-definitions.js'

describe('Tool Schema JSON Conversion', () => {
  it('should convert all tool inputSchemas to JSON Schema without error', () => {
    for (const tool of ALL_TOOLS) {
      expect(() => {
        z.toJSONSchema(tool.inputSchema, { reused: 'ref', io: 'input' })
      }).not.toThrow()
    }
  })

  it('should produce valid JSON Schema for each tool', () => {
    for (const tool of ALL_TOOLS) {
      const schema = z.toJSONSchema(tool.inputSchema, { reused: 'ref', io: 'input' })

      expect(schema).toHaveProperty('type')
      expect(typeof schema).toBe('object')
    }
  })
})
