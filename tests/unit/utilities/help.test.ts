/**
 * Unit Tests for Help Tool
 *
 * Tests the grist_help tool functionality including:
 * - Documentation loading and caching
 * - Tool name validation
 * - Response formatting (JSON and markdown)
 */

import { describe, expect, it } from 'vitest'
import { HELP_TOPICS, HelpSchema, TOOL_NAMES } from '../../../src/schemas/help.js'

describe('Help Tool - Schema Validation', () => {
  describe('TOOL_NAMES constant', () => {
    it('should contain all 11 Grist tool names', () => {
      // 11 tools (v2.0 consolidated architecture, auto-generated from ALL_TOOLS)
      // Discovery: 3, Reading: 2, Management: 3, Utility: 3
      expect(TOOL_NAMES.length).toBe(11)
    })

    it('should contain all discovery tools', () => {
      expect(TOOL_NAMES).toContain('grist_get_workspaces')
      expect(TOOL_NAMES).toContain('grist_get_documents')
      expect(TOOL_NAMES).toContain('grist_get_tables')
    })

    it('should contain all reading tools', () => {
      expect(TOOL_NAMES).toContain('grist_query_sql')
      expect(TOOL_NAMES).toContain('grist_get_records')
    })

    it('should contain consolidated management tools', () => {
      // v2.0: Consolidated tools replace granular tools
      expect(TOOL_NAMES).toContain('grist_manage_records') // replaces add/update/delete/upsert
      expect(TOOL_NAMES).toContain('grist_manage_schema') // replaces table/column/summary tools
      expect(TOOL_NAMES).toContain('grist_manage_pages') // replaces page/widget tools
    })

    it('should contain document creation tool', () => {
      expect(TOOL_NAMES).toContain('grist_create_document')
    })

    it('should contain webhook tool', () => {
      expect(TOOL_NAMES).toContain('grist_manage_webhooks')
    })

    it('should contain help tool', () => {
      expect(TOOL_NAMES).toContain('grist_help')
    })
  })

  describe('HelpSchema validation', () => {
    it('should accept valid tool names', () => {
      for (const toolName of TOOL_NAMES) {
        const result = HelpSchema.safeParse({ tool_name: toolName })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid tool names', () => {
      const result = HelpSchema.safeParse({ tool_name: 'invalid_tool' })
      expect(result.success).toBe(false)
    })

    it('should reject empty tool name', () => {
      const result = HelpSchema.safeParse({ tool_name: '' })
      expect(result.success).toBe(false)
    })

    it('should accept response_format parameter', () => {
      const jsonResult = HelpSchema.safeParse({
        tool_name: 'grist_get_records',
        response_format: 'json'
      })
      expect(jsonResult.success).toBe(true)

      const markdownResult = HelpSchema.safeParse({
        tool_name: 'grist_get_records',
        response_format: 'markdown'
      })
      expect(markdownResult.success).toBe(true)
    })

    it('should default response_format to json', () => {
      const result = HelpSchema.safeParse({ tool_name: 'grist_get_records' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.response_format).toBe('json')
      }
    })
  })

  describe('HELP_TOPICS constant', () => {
    it('should contain all 5 topic options', () => {
      expect(HELP_TOPICS.length).toBe(5)
    })

    it('should contain expected topics in order', () => {
      expect(HELP_TOPICS).toEqual(['overview', 'examples', 'errors', 'parameters', 'full'])
    })

    it('should have overview for quick summary', () => {
      expect(HELP_TOPICS).toContain('overview')
    })

    it('should have examples for code samples', () => {
      expect(HELP_TOPICS).toContain('examples')
    })

    it('should have errors for troubleshooting', () => {
      expect(HELP_TOPICS).toContain('errors')
    })

    it('should have parameters for detailed params', () => {
      expect(HELP_TOPICS).toContain('parameters')
    })

    it('should have full for complete documentation', () => {
      expect(HELP_TOPICS).toContain('full')
    })
  })

  describe('Topic parameter validation', () => {
    it('should accept all valid topics', () => {
      for (const topic of HELP_TOPICS) {
        const result = HelpSchema.safeParse({
          tool_name: 'grist_get_records',
          topic
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.topic).toBe(topic)
        }
      }
    })

    it('should default topic to full', () => {
      const result = HelpSchema.safeParse({ tool_name: 'grist_get_records' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topic).toBe('full')
      }
    })

    it('should reject invalid topic values', () => {
      const result = HelpSchema.safeParse({
        tool_name: 'grist_get_records',
        topic: 'invalid_topic'
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty topic string', () => {
      const result = HelpSchema.safeParse({
        tool_name: 'grist_get_records',
        topic: ''
      })
      expect(result.success).toBe(false)
    })

    it('should combine tool_name and topic parameters', () => {
      const result = HelpSchema.safeParse({
        tool_name: 'grist_manage_records',
        topic: 'errors',
        response_format: 'json'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tool_name).toBe('grist_manage_records')
        expect(result.data.topic).toBe('errors')
        expect(result.data.response_format).toBe('json')
      }
    })
  })
})

describe('Help Tool - Documentation Content', () => {
  it('should have tool names that follow naming convention', () => {
    for (const toolName of TOOL_NAMES) {
      // All tool names should start with 'grist_'
      expect(toolName).toMatch(/^grist_/)

      // Utility tools (grist_help) don't follow verb_noun pattern
      if (toolName === 'grist_help') continue

      // Data tools should follow verb_noun pattern
      expect(toolName).toMatch(
        /^grist_(get|add|update|upsert|delete|create|rename|manage|query|build|configure|discover)_/
      )
    }
  })

  it('should not have duplicate tool names', () => {
    const uniqueNames = new Set(TOOL_NAMES)
    expect(uniqueNames.size).toBe(TOOL_NAMES.length)
  })
})
