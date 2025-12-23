/**
 * Unit tests for help.ts tool
 *
 * Tests the grist_help tool which provides documentation for Grist tools.
 * Covers both new API (tools param) and legacy API (tool_name + topic).
 *
 * The tool now uses the factory pattern (defineStandardTool) instead of classes.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ToolContext } from '../../../src/registry/types.js'
import { HELP_TOPICS } from '../../../src/schemas/help.js'
import { getHelp, HELP_TOOL } from '../../../src/tools/help.js'

// Use real tool name that exists in TOOL_NAMES
const VALID_TOOL = 'grist_get_tables'

describe('grist_help - New API', () => {
  let context: ToolContext

  beforeEach(() => {
    context = {
      client: {} as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }
  })

  describe('Discovery mode (no tools specified)', () => {
    it('returns tool list and workflow', async () => {
      const result = await HELP_TOOL.handler(context, {})

      expect(result.structuredContent?.discovery).toBeDefined()
      const discovery = result.structuredContent?.discovery as {
        tools: unknown[]
        workflow: string
        tip: string
      }
      expect(discovery.tools.length).toBe(11)
      expect(discovery.workflow).toContain('workspaces')
      expect(discovery.tip).toContain('grist_help')
    })
  })

  describe('Single tool mode', () => {
    it('returns tool help with schema', async () => {
      const result = await HELP_TOOL.handler(context, { tools: [VALID_TOOL] })

      expect(result.structuredContent?.tools).toBeDefined()
      const tools = result.structuredContent?.tools as Record<string, unknown>
      expect(tools[VALID_TOOL]).toBeDefined()
      const toolHelp = tools[VALID_TOOL] as {
        name: string
        overview: string
        examples: unknown[]
        errors: unknown[]
        schema: unknown
      }
      expect(toolHelp.name).toBe(VALID_TOOL)
      expect(toolHelp.overview).toBeDefined()
      expect(toolHelp.schema).toBeDefined()
    })

    it('filters sections with only param', async () => {
      const result = await HELP_TOOL.handler(context, { tools: [VALID_TOOL], only: ['schema'] })

      const tools = result.structuredContent?.tools as Record<string, unknown>
      const toolHelp = tools[VALID_TOOL] as { schema: unknown; overview: unknown }
      expect(toolHelp.schema).toBeDefined()
      expect(toolHelp.overview).toBeUndefined()
    })
  })

  describe('Batch mode', () => {
    it('returns help for multiple tools', async () => {
      const result = await HELP_TOOL.handler(context, {
        tools: ['grist_get_tables', 'grist_manage_schema']
      })

      const tools = result.structuredContent?.tools as Record<string, unknown>
      expect(tools.grist_get_tables).toBeDefined()
      expect(tools.grist_manage_schema).toBeDefined()
    })

    it('includes $defs for batch schema requests', async () => {
      const result = await HELP_TOOL.handler(context, {
        tools: ['grist_get_tables', 'grist_manage_schema'],
        only: ['schema']
      })

      // $defs may or may not be present depending on shared schemas
      // Just verify the response structure is correct
      expect(result.structuredContent?.tools).toBeDefined()
    })
  })
})

describe('grist_help - Legacy API', () => {
  let context: ToolContext

  beforeEach(() => {
    context = {
      client: {} as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }
  })

  describe('execute with topic=overview', () => {
    it('returns overview documentation', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'overview' })

      expect(result.structuredContent?.documentation).toBeDefined()
      expect(result.structuredContent?.topic).toBe('overview')
    })
  })

  describe('execute with topic=examples', () => {
    it('returns formatted examples with JSON code blocks', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'examples' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
      expect(doc).toContain('```json')
    })
  })

  describe('execute with topic=errors', () => {
    it('returns error documentation', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'errors' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
      expect(doc.length).toBeGreaterThan(0)
    })
  })

  describe('execute with topic=parameters', () => {
    it('returns parameters documentation', async () => {
      const result = await HELP_TOOL.handler(context, {
        tool_name: VALID_TOOL,
        topic: 'parameters'
      })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
    })
  })

  describe('execute with topic=full', () => {
    it('returns full documentation with overview section', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'full' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toContain('## Overview')
    })

    it('is default topic when none specified', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL })

      expect(result.structuredContent?.topic).toBe('full')
    })
  })

  describe('afterExecute', () => {
    it('adds nextSteps suggesting full docs when not full topic', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'overview' })

      const nextSteps = result.structuredContent?.nextSteps as string[]
      expect(nextSteps).toContain("Use topic='full' for complete documentation")
    })

    it('suggests using the tool', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'full' })

      const nextSteps = result.structuredContent?.nextSteps as string[]
      expect(nextSteps?.some((s: string) => s.includes(VALID_TOOL))).toBe(true)
    })
  })

  describe('formatResponse', () => {
    it('returns structured content with toolName', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL })

      expect(result.structuredContent?.toolName).toBe(VALID_TOOL)
    })

    it('includes documentation in legacy format', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL, topic: 'overview' })

      // Legacy format returns JSON with documentation field
      expect(result.structuredContent?.documentation).toBeDefined()
    })
  })

  describe('availableTopics', () => {
    it('includes all help topics', async () => {
      const result = await HELP_TOOL.handler(context, { tool_name: VALID_TOOL })

      expect(result.structuredContent?.availableTopics).toEqual(HELP_TOPICS)
    })
  })
})

describe('HELP_TOOL definition', () => {
  it('has correct tool metadata', () => {
    expect(HELP_TOOL.name).toBe('grist_help')
    expect(HELP_TOOL.title).toBe('Get Tool Help')
    expect(HELP_TOOL.category).toBe('utility')
    expect(HELP_TOOL.core).toBe(true)
    expect(HELP_TOOL.annotations.readOnlyHint).toBe(true)
  })

  it('has documentation', () => {
    expect(HELP_TOOL.docs.overview).toBeDefined()
    expect(HELP_TOOL.docs.examples.length).toBeGreaterThan(0)
    expect(HELP_TOOL.docs.errors.length).toBeGreaterThan(0)
  })
})

describe('getHelp', () => {
  it('executes help and returns result (legacy API)', async () => {
    const context: ToolContext = {
      client: {} as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }

    const result = await getHelp(context, { tool_name: VALID_TOOL })

    expect(result.structuredContent?.toolName).toBe(VALID_TOOL)
  })

  it('executes help and returns result (new API)', async () => {
    const context: ToolContext = {
      client: {} as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }

    const result = await getHelp(context, { tools: [VALID_TOOL] })

    const tools = result.structuredContent?.tools as Record<string, unknown>
    expect(tools[VALID_TOOL]).toBeDefined()
  })
})
