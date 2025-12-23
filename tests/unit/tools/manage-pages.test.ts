/**
 * Unit tests for manage-pages.ts - schemas, operations, and tool definition
 */

import { describe, expect, it } from 'vitest'
import {
  MANAGE_PAGES_TOOL,
  ManagePagesSchema,
  PageRefSchema
} from '../../../src/tools/manage-pages.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('PageRefSchema', () => {
  it('accepts string page name', () => {
    const result = PageRefSchema.safeParse('Dashboard')
    expect(result.success).toBe(true)
  })

  it('accepts numeric viewId', () => {
    const result = PageRefSchema.safeParse(42)
    expect(result.success).toBe(true)
  })

  it('rejects empty string', () => {
    const result = PageRefSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  it('rejects zero viewId', () => {
    const result = PageRefSchema.safeParse(0)
    expect(result.success).toBe(false)
  })

  it('rejects negative viewId', () => {
    const result = PageRefSchema.safeParse(-1)
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - create_page Operation', () => {
  it('accepts valid create_page with simple layout', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Dashboard',
          layout: { table: 'Products', widget: 'grid' }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts create_page with cols layout', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Company View',
          layout: {
            cols: [
              { table: 'Companies', widget: 'grid' },
              { table: 'Contacts', widget: 'card_list' }
            ]
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts create_page with rows layout', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Data View',
          layout: {
            rows: [
              { table: 'Summary', widget: 'chart', chartType: 'bar' },
              { table: 'Details', widget: 'grid' }
            ]
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts create_page with nested layout', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Complex Dashboard',
          layout: {
            cols: [
              { table: 'Main', widget: 'grid' },
              {
                rows: [
                  { table: 'Chart1', widget: 'chart', chartType: 'bar' },
                  { table: 'Chart2', widget: 'chart', chartType: 'line' }
                ]
              }
            ]
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts create_page with weight', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Weighted Layout',
          layout: {
            cols: [
              { table: 'Main', widget: 'grid', weight: 2 },
              { table: 'Side', widget: 'card', weight: 1 }
            ]
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts create_page with chart configuration', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'Charts',
          layout: {
            table: 'Sales',
            widget: 'chart',
            chartType: 'bar',
            x_axis: 'Region',
            y_axis: ['Revenue', 'Cost']
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects create_page without name', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          layout: { table: 'Products', widget: 'grid' }
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects create_page with empty name', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: '',
          layout: { table: 'Products', widget: 'grid' }
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - set_layout Operation', () => {
  it('accepts set_layout with page name', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'set_layout',
          page: 'Dashboard',
          layout: { table: 'Products', widget: 'grid' }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts set_layout with viewId', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'set_layout',
          page: 42,
          layout: { cols: [5, 6] } // Existing sectionIds
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts set_layout with remove array', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'set_layout',
          page: 'Dashboard',
          layout: { cols: [5, 6] },
          remove: [7, 8]
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('ManagePagesSchema - get_layout Operation', () => {
  it('accepts get_layout with page name', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'get_layout',
          page: 'Dashboard'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts get_layout with viewId', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'get_layout',
          page: 42
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('ManagePagesSchema - rename_page Operation', () => {
  it('accepts valid rename_page', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'rename_page',
          page: 'Old Name',
          newName: 'New Name'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects rename_page with empty newName', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'rename_page',
          page: 'Dashboard',
          newName: ''
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects rename_page with long newName (>100 chars)', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'rename_page',
          page: 'Dashboard',
          newName: 'a'.repeat(101)
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - delete_page Operation', () => {
  it('accepts delete_page without deleteData', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete_page',
          page: 'Old Page'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts delete_page with deleteData false', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete_page',
          page: 'Old Page',
          deleteData: false
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts delete_page with deleteData true', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete_page',
          page: 'Old Page',
          deleteData: true
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('ManagePagesSchema - reorder_pages Operation', () => {
  it('accepts reorder_pages with page names', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'reorder_pages',
          order: ['Dashboard', 'Settings', 'Reports']
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects reorder_pages with empty order', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'reorder_pages',
          order: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects reorder_pages with empty string in order', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'reorder_pages',
          order: ['Dashboard', '', 'Reports']
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - configure_widget Operation', () => {
  it('accepts configure_widget with title', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'configure_widget',
          page: 'Dashboard',
          widget: 'Sales Table',
          title: 'New Title'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts configure_widget with sortBy', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'configure_widget',
          page: 'Dashboard',
          widget: 'Transactions',
          sortBy: ['-Date', 'Amount']
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts configure_widget with numeric sortBy', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'configure_widget',
          page: 'Dashboard',
          widget: 'Data',
          sortBy: [42, -43]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts configure_widget with mixed sortBy', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'configure_widget',
          page: 'Dashboard',
          widget: 'Data',
          sortBy: ['-Date', 42, 'Name']
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('ManagePagesSchema - link_widgets Operation', () => {
  it('accepts link_widgets without source_widget (auto-populated from source)', () => {
    // source_widget is optional - it gets auto-populated from the top-level source field
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'link_widgets',
          viewId: 42,
          links: [
            {
              source: 101,
              target: 102,
              link: { type: 'child_of', target_column: 'Company' }
            }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts link_widgets with explicit source_widget (backward compatible)', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'link_widgets',
          viewId: 42,
          links: [
            {
              source: 101,
              target: 102,
              link: { type: 'child_of', source_widget: 101, target_column: 'Company' }
            }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts link_widgets with multiple links', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'link_widgets',
          viewId: 42,
          links: [
            {
              source: 101,
              target: 102,
              link: { type: 'child_of', target_column: 'Company' }
            },
            {
              source: 102,
              target: 103,
              link: { type: 'synced_with' }
            }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects link_widgets with empty links array', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'link_widgets',
          viewId: 42,
          links: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects link_widgets with invalid viewId', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'link_widgets',
          viewId: 0, // Invalid: not positive
          links: [
            {
              source: 101,
              target: 102,
              link: { type: 'child_of', source_widget: 101, target_column: 'X' }
            }
          ]
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - Multiple Operations', () => {
  it('accepts mixed operations', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create_page',
          name: 'New Dashboard',
          layout: { table: 'Products', widget: 'grid' }
        },
        {
          action: 'rename_page',
          page: 'Old Page',
          newName: 'Archive'
        },
        {
          action: 'reorder_pages',
          order: ['New Dashboard', 'Archive']
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty operations array', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: []
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 operations', () => {
    const operations = Array.from({ length: 21 }, () => ({
      action: 'get_layout' as const,
      page: 'Dashboard'
    }))

    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations
    })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 20 operations', () => {
    const operations = Array.from({ length: 20 }, () => ({
      action: 'get_layout' as const,
      page: 'Dashboard'
    }))

    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations
    })
    expect(result.success).toBe(true)
  })
})

describe('ManagePagesSchema - DocId Validation', () => {
  it('rejects missing docId', () => {
    const result = ManagePagesSchema.safeParse({
      operations: [{ action: 'get_layout', page: 'Dashboard' }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects short docId', () => {
    const result = ManagePagesSchema.safeParse({
      docId: 'short',
      operations: [{ action: 'get_layout', page: 'Dashboard' }]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManagePagesSchema - Invalid Action', () => {
  it('rejects unknown action type', () => {
    const result = ManagePagesSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'unknown_action',
          page: 'Dashboard'
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('MANAGE_PAGES_TOOL definition', () => {
  it('has correct name', () => {
    expect(MANAGE_PAGES_TOOL.name).toBe('grist_manage_pages')
  })

  it('has correct category', () => {
    expect(MANAGE_PAGES_TOOL.category).toBe('document_structure')
  })

  it('has handler function', () => {
    expect(typeof MANAGE_PAGES_TOOL.handler).toBe('function')
  })

  it('has inputSchema', () => {
    expect(MANAGE_PAGES_TOOL.inputSchema).toBeDefined()
  })

  it('has outputSchema', () => {
    expect(MANAGE_PAGES_TOOL.outputSchema).toBeDefined()
  })

  it('has documentation', () => {
    expect(MANAGE_PAGES_TOOL.docs).toBeDefined()
    expect(MANAGE_PAGES_TOOL.docs.overview).toBeDefined()
    expect(MANAGE_PAGES_TOOL.docs.examples).toBeDefined()
    expect(MANAGE_PAGES_TOOL.docs.errors).toBeDefined()
  })

  it('has examples', () => {
    const examples = MANAGE_PAGES_TOOL.docs.examples
    expect(examples.length).toBeGreaterThan(0)
  })

  it('has annotations', () => {
    expect(MANAGE_PAGES_TOOL.annotations).toBeDefined()
  })

  it('has error documentation', () => {
    const errors = MANAGE_PAGES_TOOL.docs.errors
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.error.includes('Page'))).toBe(true)
    expect(errors.some((e) => e.error.includes('Table'))).toBe(true)
  })

  it('documentation mentions link types', () => {
    // Link types moved to docs.parameters for brevity
    const parameters = MANAGE_PAGES_TOOL.docs.parameters || ''
    expect(parameters).toContain('child_of')
    expect(parameters).toContain('synced_with')
  })
})
