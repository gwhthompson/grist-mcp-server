/**
 * Unit Tests for Help Tool
 *
 * Tests the grist_help tool functionality including:
 * - Schema validation for both new and legacy APIs
 * - Response formatting
 * - Discovery and tool help modes
 */

import { describe, expect, it } from 'vitest'
import { HELP_SECTIONS, HELP_TOPICS, HelpSchema, TOOL_NAMES } from '../../../src/schemas/help.js'

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

  describe('HELP_SECTIONS constant (new API)', () => {
    it('should contain all 4 section options', () => {
      expect(HELP_SECTIONS.length).toBe(4)
    })

    it('should contain expected sections', () => {
      expect(HELP_SECTIONS).toContain('overview')
      expect(HELP_SECTIONS).toContain('examples')
      expect(HELP_SECTIONS).toContain('errors')
      expect(HELP_SECTIONS).toContain('schema')
    })
  })

  describe('HELP_TOPICS constant (legacy API)', () => {
    it('should contain all 5 topic options for backward compatibility', () => {
      expect(HELP_TOPICS.length).toBe(5)
    })

    it('should contain expected topics in order', () => {
      expect(HELP_TOPICS).toEqual(['overview', 'examples', 'errors', 'parameters', 'full'])
    })
  })

  describe('New API: tools parameter', () => {
    it('should accept empty object for discovery mode', () => {
      const result = HelpSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept array with single tool name', () => {
      const result = HelpSchema.safeParse({ tools: ['grist_manage_schema'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tools).toEqual(['grist_manage_schema'])
      }
    })

    it('should accept array of tool names', () => {
      const result = HelpSchema.safeParse({
        tools: ['grist_manage_schema', 'grist_manage_records']
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tools).toEqual(['grist_manage_schema', 'grist_manage_records'])
      }
    })

    it('should reject single string (must be array)', () => {
      const result = HelpSchema.safeParse({ tools: 'grist_manage_schema' })
      expect(result.success).toBe(false)
    })

    it('should reject invalid tool names', () => {
      const result = HelpSchema.safeParse({ tools: ['invalid_tool'] })
      expect(result.success).toBe(false)
    })

    it('should reject empty array', () => {
      const result = HelpSchema.safeParse({ tools: [] })
      expect(result.success).toBe(false)
    })
  })

  describe('New API: only parameter', () => {
    it('should accept valid section filters', () => {
      const result = HelpSchema.safeParse({
        tools: ['grist_manage_schema'],
        only: ['schema']
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.only).toEqual(['schema'])
      }
    })

    it('should accept multiple sections', () => {
      const result = HelpSchema.safeParse({
        tools: ['grist_manage_schema'],
        only: ['overview', 'examples', 'schema']
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid section names', () => {
      const result = HelpSchema.safeParse({
        tools: ['grist_manage_schema'],
        only: ['invalid_section']
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Legacy API: tool_name parameter (deprecated)', () => {
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
  })

  describe('Legacy API: topic parameter (deprecated)', () => {
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
        topic: 'errors'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tool_name).toBe('grist_manage_records')
        expect(result.data.topic).toBe('errors')
      }
    })
  })
})

describe('Help Tool - Documentation Content', () => {
  it('should have tool names that follow naming convention', () => {
    for (const toolName of TOOL_NAMES) {
      expect(toolName).toMatch(/^grist_[a-z_]+$/)
    }
  })

  it('should have unique tool names', () => {
    const uniqueNames = new Set(TOOL_NAMES)
    expect(uniqueNames.size).toBe(TOOL_NAMES.length)
  })
})
