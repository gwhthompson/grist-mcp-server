/**
 * Unit tests for help.ts tool
 *
 * Tests the GetHelpTool which provides documentation for Grist tools.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../../src/registry/types.js'
import { HELP_TOPICS } from '../../../src/schemas/help.js'
import { createGetHelpTool, GetHelpTool, getHelp } from '../../../src/tools/help.js'

// Use real tool name that exists in TOOL_NAMES
const VALID_TOOL = 'grist_get_tables'

describe('GetHelpTool', () => {
  let context: ToolContext
  let tool: GetHelpTool

  beforeEach(() => {
    context = {
      client: {} as ToolContext['client'],
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      schemaCache: {} as ToolContext['schemaCache']
    }
    tool = new GetHelpTool(context)
  })

  describe('execute with topic=overview', () => {
    it('returns overview documentation', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'overview' })

      expect(result.structuredContent?.documentation).toBeDefined()
      expect(result.structuredContent?.topic).toBe('overview')
    })
  })

  describe('execute with topic=examples', () => {
    it('returns formatted examples with JSON code blocks', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'examples' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
      // Real grist_get_tables has examples
      expect(doc).toContain('```json')
    })
  })

  describe('execute with topic=errors', () => {
    it('returns error documentation', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'errors' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
      // Real grist_get_tables has error docs
      expect(doc.length).toBeGreaterThan(0)
    })
  })

  describe('execute with topic=parameters', () => {
    it('returns parameters documentation', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'parameters' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toBeDefined()
    })
  })

  describe('execute with topic=full', () => {
    it('returns full documentation with overview section', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'full' })

      const doc = result.structuredContent?.documentation as string
      expect(doc).toContain('## Overview')
    })

    it('is default topic when none specified', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL })

      expect(result.structuredContent?.topic).toBe('full')
    })
  })

  describe('afterExecute', () => {
    it('adds nextSteps suggesting full docs when not full topic', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'overview' })

      const nextSteps = result.structuredContent?.nextSteps as string[]
      expect(nextSteps).toContain("Use topic='full' for complete documentation")
    })

    it('suggests using the tool', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL, topic: 'full' })

      const nextSteps = result.structuredContent?.nextSteps as string[]
      expect(nextSteps?.some((s: string) => s.includes(VALID_TOOL))).toBe(true)
    })
  })

  describe('formatResponse', () => {
    it('formats as JSON by default', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL })

      expect(result.content[0].text).toContain('"toolName"')
    })

    it('formats as markdown when requested', async () => {
      const result = await tool.execute({
        tool_name: VALID_TOOL,
        topic: 'overview',
        response_format: 'markdown'
      })

      expect(result.content[0].text).toContain(`# ${VALID_TOOL}`)
      expect(result.content[0].text).toContain('(overview)')
    })

    it('shows other topics hint when not full in markdown', async () => {
      const result = await tool.execute({
        tool_name: VALID_TOOL,
        topic: 'overview',
        response_format: 'markdown'
      })

      expect(result.content[0].text).toContain('Other topics:')
    })
  })

  describe('availableTopics', () => {
    it('includes all help topics', async () => {
      const result = await tool.execute({ tool_name: VALID_TOOL })

      expect(result.structuredContent?.availableTopics).toEqual(HELP_TOPICS)
    })
  })
})

describe('createGetHelpTool', () => {
  it('creates a GetHelpTool instance', () => {
    const context: ToolContext = {
      client: {} as ToolContext['client'],
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      schemaCache: {} as ToolContext['schemaCache']
    }

    const tool = createGetHelpTool(context)

    expect(tool).toBeInstanceOf(GetHelpTool)
  })
})

describe('getHelp', () => {
  it('executes help and returns result', async () => {
    const context: ToolContext = {
      client: {} as ToolContext['client'],
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      schemaCache: {} as ToolContext['schemaCache']
    }

    const result = await getHelp(context, { tool_name: VALID_TOOL })

    expect(result.structuredContent?.toolName).toBe(VALID_TOOL)
  })
})
