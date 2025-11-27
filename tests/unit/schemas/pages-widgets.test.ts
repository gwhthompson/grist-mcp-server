/**
 * Unit Tests for Pages & Widgets Schema Validation
 *
 * This test suite verifies the Zod v3 schemas for pages/widgets tools:
 * - BuildPageSchema: Pattern-based page creation validation
 * - LayoutSpecSchema: Recursive layout structure validation
 * - Discriminated union validation for pattern types
 * - Cross-field validation with superRefine
 */

import { describe, expect, it } from 'vitest'
import {
  BuildPageSchema,
  ConfigureWidgetSchema,
  LayoutSpecSchema,
  UpdatePageSchema
} from '../../../src/schemas/pages-widgets.js'

describe('Pages & Widgets Schema Validation', () => {
  describe('BuildPageSchema - Master-Detail Pattern', () => {
    it('should accept valid master-detail configuration', () => {
      const validInput = {
        docId: 'a'.repeat(22),
        page_name: 'Sales Dashboard',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'Customers',
            widget_type: 'card_list',
            width: 40
          },
          detail: {
            table: 'Orders',
            widget_type: 'grid',
            link_field: 'CustomerRef'
          },
          split: 'horizontal'
        },
        response_format: 'markdown'
      }

      const result = BuildPageSchema.safeParse(validInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.config.pattern).toBe('master_detail')
      }
    })

    it('should accept vertical split', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test Page',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'Projects',
            widget_type: 'grid'
          },
          detail: {
            table: 'Tasks',
            widget_type: 'card_list',
            link_field: 'ProjectRef'
          },
          split: 'vertical'
        },
        response_format: 'json'
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should default split to horizontal', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test Page',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'card'
          },
          detail: {
            table: 'B',
            widget_type: 'grid',
            link_field: 'ARef'
          }
          // No split specified
        },
        response_format: 'markdown'
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success && result.data.config.pattern === 'master_detail') {
        expect(result.data.config.split).toBe('horizontal')
      }
    })

    it('should default master width to 50', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test Page',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'grid'
            // No width specified
          },
          detail: {
            table: 'B',
            widget_type: 'card_list',
            link_field: 'ARef'
          }
        },
        response_format: 'markdown'
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success && result.data.config.pattern === 'master_detail') {
        expect(result.data.config.master.width).toBe(50)
      }
    })

    it('should reject invalid widget types', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'invalid_type' // Invalid
          },
          detail: {
            table: 'B',
            widget_type: 'grid',
            link_field: 'ARef'
          }
        },
        response_format: 'markdown'
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject width outside 10-90 range', () => {
      const inputTooLow = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'grid',
            width: 5 // Too low
          },
          detail: {
            table: 'B',
            widget_type: 'card_list',
            link_field: 'ARef'
          }
        },
        response_format: 'markdown'
      }

      expect(BuildPageSchema.safeParse(inputTooLow).success).toBe(false)

      const inputTooHigh = {
        ...inputTooLow,
        config: {
          ...inputTooLow.config,
          master: {
            ...inputTooLow.config.master,
            width: 95 // Too high
          }
        }
      }

      expect(BuildPageSchema.safeParse(inputTooHigh).success).toBe(false)
    })

    it('should reject missing required fields', () => {
      const missingLinkField = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'grid'
          },
          detail: {
            table: 'B',
            widget_type: 'card_list'
            // Missing link_field
          }
        },
        response_format: 'markdown'
      }

      expect(BuildPageSchema.safeParse(missingLinkField).success).toBe(false)
    })

    it('should reject invalid split values', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'grid'
          },
          detail: {
            table: 'B',
            widget_type: 'card_list',
            link_field: 'ARef'
          },
          split: 'diagonal' // Invalid
        },
        response_format: 'markdown'
      }

      expect(BuildPageSchema.safeParse(input).success).toBe(false)
    })
  })

  describe('BuildPageSchema - Other Patterns', () => {
    it('should accept hierarchical pattern', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Org Chart',
        config: {
          pattern: 'hierarchical',
          levels: [
            {
              table: 'Departments',
              widget_type: 'grid',
              group_by: ['Region']
            },
            {
              table: 'Teams',
              widget_type: 'card_list',
              group_by: ['Department', 'Region']
            }
          ]
        }
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept chart_dashboard pattern', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Analytics',
        config: {
          pattern: 'chart_dashboard',
          selector: {
            table: 'Sales',
            widget_type: 'grid'
          },
          charts: [
            {
              table: 'Sales',
              widget_type: 'chart',
              chart_type: 'line',
              x_axis: 'Date',
              y_axis: ['Amount']
            }
          ]
        }
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept form_table pattern', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Entry Form',
        config: {
          pattern: 'form_table',
          form: {
            table: 'Contacts',
            widget_type: 'form',
            fields: ['Name', 'Email', 'Phone']
          },
          table: {
            table: 'Contacts',
            widget_type: 'grid'
          },
          split: 'horizontal'
        }
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept custom pattern with at least 1 widget', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Custom Layout',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Data',
              widget_type: 'card'
            }
          ]
        }
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should reject custom pattern with empty widgets array', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Invalid Custom',
        config: {
          pattern: 'custom',
          widgets: []
        }
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('BuildPageSchema - Page Name Validation', () => {
    it('should accept valid page names', () => {
      const validNames = [
        'Sales Dashboard',
        'My Page',
        'Page_123',
        'αβγ', // Unicode
        '🎯 Goals' // Emoji
      ]

      for (const name of validNames) {
        const input = {
          docId: 'a'.repeat(22),
          page_name: name,
          config: {
            pattern: 'master_detail',
            master: {
              table: 'A',
              widget_type: 'grid'
            },
            detail: {
              table: 'B',
              widget_type: 'card',
              link_field: 'ARef'
            }
          },
          response_format: 'markdown'
        }

        const result = BuildPageSchema.safeParse(input)
        expect(result.success).toBe(true)
      }
    })

    it('should reject empty page name', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: '',
        config: {
          pattern: 'master_detail',
          master: { table: 'A', widget_type: 'grid' },
          detail: { table: 'B', widget_type: 'card', link_field: 'ARef' }
        },
        response_format: 'markdown'
      }

      expect(BuildPageSchema.safeParse(input).success).toBe(false)
    })

    it('should reject page name exceeding 255 characters', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'a'.repeat(256),
        config: {
          pattern: 'master_detail',
          master: { table: 'A', widget_type: 'grid' },
          detail: { table: 'B', widget_type: 'card', link_field: 'ARef' }
        },
        response_format: 'markdown'
      }

      expect(BuildPageSchema.safeParse(input).success).toBe(false)
    })
  })

  describe('LayoutSpecSchema - Recursive Validation', () => {
    it('should accept leaf layout (single widget)', () => {
      const layout = {
        type: 'leaf',
        leaf: 123
      }

      const result = LayoutSpecSchema.safeParse(layout)
      expect(result.success).toBe(true)
    })

    it('should accept horizontal split layout', () => {
      const layout = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.6
      }

      const result = LayoutSpecSchema.safeParse(layout)
      expect(result.success).toBe(true)
    })

    it('should accept vertical split layout', () => {
      const layout = {
        type: 'vsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.4
      }

      const result = LayoutSpecSchema.safeParse(layout)
      expect(result.success).toBe(true)
    })

    it('should accept nested split layouts', () => {
      const layout = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          {
            type: 'vsplit',
            children: [
              { type: 'leaf', leaf: 2 },
              { type: 'leaf', leaf: 3 }
            ],
            splitRatio: 0.5
          }
        ],
        splitRatio: 0.3
      }

      const result = LayoutSpecSchema.safeParse(layout)
      expect(result.success).toBe(true)
    })

    it('should default splitRatio to 0.5', () => {
      const layout = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ]
        // No splitRatio specified
      }

      const result = LayoutSpecSchema.safeParse(layout)
      expect(result.success).toBe(true)
      if (result.success && result.data.type !== 'leaf') {
        expect(result.data.splitRatio).toBe(0.5)
      }
    })

    it('should reject splitRatio outside 0.1-0.9 range', () => {
      const layoutTooLow = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 },
          { type: 'leaf', leaf: 2 }
        ],
        splitRatio: 0.05
      }

      expect(LayoutSpecSchema.safeParse(layoutTooLow).success).toBe(false)

      const layoutTooHigh = {
        ...layoutTooLow,
        splitRatio: 0.95
      }

      expect(LayoutSpecSchema.safeParse(layoutTooHigh).success).toBe(false)
    })

    it('should reject split with less than 2 children', () => {
      const layout = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 1 }
          // Only 1 child
        ],
        splitRatio: 0.5
      }

      expect(LayoutSpecSchema.safeParse(layout).success).toBe(false)
    })

    it('should reject split with more than 10 children', () => {
      const layout = {
        type: 'hsplit',
        children: Array.from({ length: 11 }, (_, i) => ({
          type: 'leaf' as const,
          leaf: i + 1
        })),
        splitRatio: 0.5
      }

      expect(LayoutSpecSchema.safeParse(layout).success).toBe(false)
    })

    it('should reject leaf with non-positive ID', () => {
      expect(LayoutSpecSchema.safeParse({ type: 'leaf', leaf: 0 }).success).toBe(false)
      expect(LayoutSpecSchema.safeParse({ type: 'leaf', leaf: -1 }).success).toBe(false)
    })

    it('should reject unknown layout type', () => {
      const layout = {
        type: 'diagonal', // Invalid
        children: []
      }

      expect(LayoutSpecSchema.safeParse(layout).success).toBe(false)
    })
  })

  describe('ConfigureWidgetSchema', () => {
    it('should accept valid widget configuration', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: 'Sales Table',
            title: 'Updated Sales Table'
          }
        ],
        response_format: 'json'
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('UpdatePageSchema', () => {
    it('should accept valid page update', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'rename',
            page_name: 'Old Name',
            new_name: 'New Name'
          }
        ],
        response_format: 'markdown'
      }

      const result = UpdatePageSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('Response Format Validation', () => {
    it('should accept valid response formats', () => {
      const formats: Array<'json' | 'markdown'> = ['json', 'markdown']

      for (const format of formats) {
        const input = {
          docId: 'a'.repeat(22),
          page_name: 'Test',
          config: {
            pattern: 'master_detail',
            master: {
              table: 'Customers',
              widget_type: 'grid'
            },
            detail: {
              table: 'Orders',
              widget_type: 'card',
              link_field: 'CustomerRef'
            }
          },
          response_format: format
        }

        expect(BuildPageSchema.safeParse(input).success).toBe(true)
      }
    })

    it('should default to markdown', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'Customers',
            widget_type: 'grid'
          },
          detail: {
            table: 'Orders',
            widget_type: 'card',
            link_field: 'CustomerRef'
          }
        }
        // No response_format specified
      }

      const result = BuildPageSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.response_format).toBe('markdown')
      }
    })

    it('should reject invalid response format', () => {
      const input = {
        docId: 'a'.repeat(22),
        page_name: 'Test',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'A',
            widget_type: 'grid'
          },
          detail: {
            table: 'B',
            widget_type: 'card',
            link_field: 'ARef'
          }
        },
        response_format: 'xml' // Invalid
      }

      expect(BuildPageSchema.safeParse(input).success).toBe(false)
    })
  })

  describe('WidgetIdentifierSchema - String and Numeric IDs', () => {
    it('should accept string widget name in ConfigureWidgetSchema', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: 'Sales Table', // String widget name
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric section ID in ConfigureWidgetSchema', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: 42, // Numeric section ID
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric widget ID for link source_widget', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'link',
            page_name: 'Dashboard',
            target_widget: 'Orders',
            link_config: {
              source_widget: 123 // Numeric section ID
            }
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric target_widget for link operation', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'link',
            page_name: 'Dashboard',
            target_widget: 456, // Numeric section ID
            link_config: {
              source_widget: 'Customers'
            }
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric widget ID for sort operation', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'sort',
            page_name: 'Dashboard',
            widget: 789, // Numeric section ID
            sort_spec: [1, -2]
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric widget ID for filter operation', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'filter',
            page_name: 'Dashboard',
            widget: 101, // Numeric section ID
            column: 'Status',
            filter_spec: {
              included: ['Active', 'Pending']
            }
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept numeric widget ID for delete operation', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'delete',
            page_name: 'Dashboard',
            widget: 202 // Numeric section ID
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should reject empty string widget ID', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: '', // Empty string - invalid
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject zero widget ID', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: 0, // Zero - invalid (must be positive)
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject negative widget ID', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: -5, // Negative - invalid
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject non-integer numeric widget ID', () => {
      const input = {
        docId: 'a'.repeat(22),
        operations: [
          {
            action: 'modify',
            page_name: 'Dashboard',
            widget: 42.5, // Float - invalid (must be integer)
            title: 'Updated Title'
          }
        ]
      }

      const result = ConfigureWidgetSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })
})
