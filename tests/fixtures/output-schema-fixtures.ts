/**
 * Output schema test fixtures.
 * Mock data that matches each tool's executeInternal() return structure.
 * Used for validating output schemas against actual tool return types.
 */

// ============================================================================
// Discovery Tool Fixtures
// ============================================================================

export const GetWorkspacesFixtures = {
  minimal: {
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  },
  withWorkspaces: {
    items: [
      {
        id: 1,
        name: 'Personal',
        org: 'personal',
        org_domain: 'docs',
        doc_count: 5,
        access: 'owners'
      },
      {
        id: 2,
        name: 'Team Workspace',
        org: 'team-org',
        org_domain: 'team',
        doc_count: 10,
        access: 'editors',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-06-20T14:45:00Z'
      }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  }
}

export const GetDocumentsFixtures = {
  minimal: {
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  },
  withDocuments: {
    items: [
      {
        id: 'fdCVLvgAPAD1HXhQcGHCyz',
        name: 'Customer CRM',
        workspace: 'Personal',
        workspace_id: 1,
        access: 'owners',
        url: 'https://docs.getgrist.com/fdCVLvgAPAD1HXhQcGHCyz'
      },
      {
        id: 'abc123def456ghi789jkl0',
        name: 'Sales Report',
        workspace: { id: 2, name: 'Team Workspace' },
        workspace_id: 2,
        access: 'editors',
        is_pinned: true,
        created_at: '2024-03-10T08:00:00Z',
        updated_at: '2024-06-25T16:30:00Z',
        public: false
      }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  }
}

export const GetTablesFixtures = {
  minimal: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_count: 0,
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    page_number: 1,
    total_pages: 0,
    items_in_page: 0
  },
  withTables: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_count: 2,
    items: [
      { id: 'Customers', columns: ['Name', 'Email', 'Phone'] },
      { id: 'Orders', columns: ['OrderId', 'Customer', 'Amount', 'Date'] }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    page_number: 1,
    total_pages: 1,
    items_in_page: 2
  },
  fullSchema: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_count: 1,
    items: [
      {
        id: 'Customers',
        columns: [
          {
            id: 'Name',
            label: 'Name',
            type: 'Text',
            is_formula: false,
            formula: null,
            widget_options: null,
            visible_col: null,
            visible_col_name: null
          },
          {
            id: 'Email',
            label: 'Email',
            type: 'Text',
            is_formula: false,
            formula: null,
            widget_options: { widget: 'HyperLink' },
            visible_col: null,
            visible_col_name: null
          }
        ]
      }
    ],
    total: 1,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    page_number: 1,
    total_pages: 1,
    items_in_page: 1
  }
}

// ============================================================================
// Reading Tool Fixtures
// ============================================================================

export const GetRecordsFixtures = {
  minimal: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  },
  withRecords: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    items: [
      { id: 1, Name: 'Alice', Email: 'alice@example.com' },
      { id: 2, Name: 'Bob', Email: 'bob@example.com' }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    filters: { Status: 'Active' },
    columns: ['Name', 'Email']
  },
  withFormulaErrors: {
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Calculations',
    items: [{ id: 1, Value: 10, Result: null }],
    total: 1,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    formula_errors: {
      records_with_errors: 1,
      affected_columns: ['Result']
    }
  }
}

export const QuerySqlFixtures = {
  minimal: {
    records: [],
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  },
  withResults: {
    records: [
      { Name: 'Alice', Count: 5, Total: 250.0 },
      { Name: 'Bob', Count: 3, Total: 150.0 }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null
  }
}

// ============================================================================
// Record Operation Fixtures
// ============================================================================

export const AddRecordsFixtures = {
  single: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_added: 1,
    record_ids: [1],
    message: 'Successfully added 1 record'
  },
  multiple: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_added: 3,
    record_ids: [1, 2, 3]
  }
}

export const UpdateRecordsFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_updated: 2,
    message: 'Successfully updated 2 records'
  }
}

export const UpsertRecordsFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_processed: 5,
    record_ids: [1, 2, 3, 4, 5],
    message: 'Upsert completed successfully',
    note: '3 records updated, 2 records added'
  }
}

export const DeleteRecordsFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_deleted: 2,
    message: 'Successfully deleted 2 records'
  },
  withWarning: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    records_deleted: 0,
    warning: 'No records matched the provided IDs'
  }
}

// ============================================================================
// Table Operation Fixtures
// ============================================================================

export const CreateTableFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'NewTable',
    table_name: 'NewTable',
    columns_created: 3,
    message: 'Table created successfully',
    url: 'https://docs.getgrist.com/fdCVLvgAPAD1HXhQcGHCyz/p/1'
  },
  withWarnings: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Products',
    table_name: 'Products',
    columns_created: 2,
    warnings: [
      {
        column: 'price',
        issue: 'Column name lowercase',
        suggestion: 'Consider using PascalCase: Price'
      }
    ]
  }
}

export const RenameTableFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    old_table_id: 'OldName',
    new_table_id: 'NewName',
    message: 'Table renamed successfully'
  }
}

export const DeleteTableFixtures = {
  basic: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'DeletedTable',
    message: 'Table deleted successfully'
  }
}

export const CreateSummaryTableFixtures = {
  basic: {
    success: true as const,
    summary_table_id: 'Sales_summary_Region_Year',
    source_table: 'Sales',
    group_by_columns: ['Region', 'Year'],
    columns: ['Region', 'Year', 'count', 'Amount'],
    description: 'Summary of Sales grouped by Region, Year'
  }
}

// ============================================================================
// Column Operation Fixtures
// ============================================================================

export const ManageColumnsFixtures = {
  singleAdd: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    operations_performed: 1,
    actions: ['Added column Phone (Text)'],
    summary: 'Successfully completed 1 operation'
  },
  multipleOperations: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Customers',
    operations_performed: 3,
    actions: [
      'Added column Phone (Text)',
      'Modified column Email widgetOptions',
      'Renamed column Addr to Address'
    ],
    message: 'All operations completed successfully',
    details: ['Phone: Created as Text type', 'Email: Updated widget to HyperLink'],
    hint: 'Use grist_get_tables to verify changes'
  }
}

export const ManageConditionalRulesFixtures = {
  add: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Sales',
    scope: 'column',
    action: 'add',
    rules_count: 2
  },
  list: {
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    table_id: 'Sales',
    scope: 'column',
    action: 'list',
    rules_count: 2,
    rules: [
      { index: 0, formula: '$Amount > 1000', style: { fillColor: '#00FF00' } },
      { index: 1, formula: '$Amount < 0', style: { fillColor: '#FF0000', textColor: '#FFFFFF' } }
    ]
  }
}

// ============================================================================
// Document Operation Fixtures
// ============================================================================

export const CreateDocumentFixtures = {
  basic: {
    success: true as const,
    document_id: 'newDocId12345678901234',
    document_name: 'New Project',
    workspace_id: 1,
    url: 'https://docs.getgrist.com/newDocId12345678901234',
    forked_from: null,
    message: 'Document created successfully',
    next_steps: ['Create tables with grist_create_table', 'Add records with grist_add_records']
  },
  forked: {
    success: true as const,
    document_id: 'forkedDocId12345678901',
    document_name: 'Project Copy',
    workspace_id: 2,
    url: 'https://docs.getgrist.com/forkedDocId12345678901',
    forked_from: 'originalDocId123456789'
  }
}

// ============================================================================
// Page/Widget Operation Fixtures
// ============================================================================

export const GetPagesFixtures = {
  minimal: {
    success: true as const,
    doc_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [],
    raw_data_tables: [],
    summary: {
      total_pages: 0,
      total_widgets: 0,
      total_tables: 0,
      summary_tables: 0
    },
    pagination: {
      total: 0,
      offset: 0,
      limit: 50,
      has_more: false,
      next_offset: null
    }
  },
  withWidgets: {
    success: true as const,
    doc_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        page_id: 1,
        page_name: 'Dashboard',
        widgets: [
          {
            widget_id: 101,
            title: 'Customer Grid',
            widget_type: 'grid',
            table_id: 'Customers',
            table_ref: 5,
            is_summary_table: false
          },
          {
            widget_id: 102,
            title: 'Order Details',
            widget_type: 'card',
            table_id: 'Orders',
            table_ref: 6,
            is_summary_table: false
          }
        ]
      }
    ],
    raw_data_tables: [
      {
        table_id: 'Hidden_Config',
        table_ref: 10,
        is_summary_table: false,
        referenced_on_pages: []
      }
    ],
    summary: {
      total_pages: 1,
      total_widgets: 2,
      total_tables: 3,
      summary_tables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      has_more: false,
      next_offset: null
    }
  },
  withSummaryTables: {
    success: true as const,
    doc_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        page_id: 1,
        page_name: 'Sales Analysis',
        widgets: [
          {
            widget_id: 201,
            title: 'Sales by Region',
            widget_type: 'grid',
            table_id: 'Sales_summary_Region',
            table_ref: 15,
            is_summary_table: true,
            summary_source_table: 'Sales',
            group_by_columns: ['Region']
          }
        ]
      }
    ],
    raw_data_tables: [],
    summary: {
      total_pages: 1,
      total_widgets: 1,
      total_tables: 2,
      summary_tables: 1
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      has_more: false,
      next_offset: null
    }
  },
  withLinking: {
    success: true as const,
    doc_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        page_id: 1,
        page_name: 'Master Detail',
        widgets: [
          {
            widget_id: 301,
            title: 'Customers',
            widget_type: 'grid',
            table_id: 'Customers',
            table_ref: 5,
            is_summary_table: false
          },
          {
            widget_id: 302,
            title: 'Orders',
            widget_type: 'grid',
            table_id: 'Orders',
            table_ref: 6,
            is_summary_table: false,
            linked_to: {
              source_widget_id: 301,
              source_col_ref: 0,
              target_col_ref: 25
            }
          }
        ]
      }
    ],
    raw_data_tables: [],
    summary: {
      total_pages: 1,
      total_widgets: 2,
      total_tables: 2,
      summary_tables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      has_more: false,
      next_offset: null
    }
  },
  withChartConfig: {
    success: true as const,
    doc_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        page_id: 1,
        page_name: 'Charts',
        widgets: [
          {
            widget_id: 401,
            title: 'Sales Chart',
            widget_type: 'chart',
            table_id: 'Sales',
            table_ref: 8,
            is_summary_table: false,
            chart_config: {
              chart_type: 'bar'
            }
          }
        ]
      }
    ],
    raw_data_tables: [],
    summary: {
      total_pages: 1,
      total_widgets: 1,
      total_tables: 1,
      summary_tables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      has_more: false,
      next_offset: null
    }
  }
}

export const BuildPageFixtures = {
  basic: {
    success: true as const,
    page_name: 'New Dashboard',
    view_id: 10,
    pattern: 'master_detail',
    description: 'Master-detail page with Customers and Orders',
    widgets: [
      { section_id: 101, table_ref: 5, position: 'left', title: 'Customers' },
      { section_id: 102, table_ref: 6, position: 'right', title: 'Orders' }
    ]
  }
}

export const ConfigureWidgetFixtures = {
  basic: {
    success: true as const,
    operations_completed: 2,
    summary: ['Linked Orders to Customers', 'Added sort by Date DESC']
  }
}

export const UpdatePageFixtures = {
  basic: {
    success: true as const,
    operations_completed: 1,
    summary: ['Renamed page from "Old Name" to "New Name"']
  }
}

// ============================================================================
// Webhook Operation Fixtures
// ============================================================================

export const WebhookListFixtures = {
  empty: {
    operation: 'list' as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    webhook_count: 0,
    total: 0,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    page_number: 1,
    total_pages: 0,
    items_in_page: 0,
    webhooks: []
  },
  withWebhooks: {
    operation: 'list' as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    webhook_count: 2,
    total: 2,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    page_number: 1,
    total_pages: 1,
    items_in_page: 2,
    webhooks: [
      {
        id: 'webhook-uuid-1234',
        name: 'New Customer Alert',
        url: 'https://hooks.example.com/customers',
        table_id: 'Customers',
        event_types: ['add'],
        enabled: true,
        is_ready_column: null,
        memo: 'Sends notification when new customer added'
      },
      {
        id: 'webhook-uuid-5678',
        name: 'Order Update',
        url: 'https://hooks.example.com/orders',
        table_id: 'Orders',
        event_types: ['add', 'update'],
        enabled: true,
        is_ready_column: 'IsReady',
        memo: null
      }
    ]
  }
}

export const WebhookCreateFixtures = {
  basic: {
    operation: 'create' as const,
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    webhook_id: 'new-webhook-uuid',
    webhook_url: 'https://hooks.example.com/new',
    table_id: 'Customers',
    event_types: ['add', 'update']
  }
}

export const WebhookUpdateFixtures = {
  basic: {
    operation: 'update' as const,
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    webhook_id: 'webhook-uuid-1234',
    fields_updated: ['url', 'enabled']
  }
}

export const WebhookDeleteFixtures = {
  basic: {
    operation: 'delete' as const,
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    webhook_id: 'webhook-uuid-1234'
  }
}

export const WebhookClearQueueFixtures = {
  basic: {
    operation: 'clear_queue' as const,
    success: true as const,
    document_id: 'fdCVLvgAPAD1HXhQcGHCyz',
    action: 'cleared_webhook_queue' as const
  }
}

// ============================================================================
// Utility Tool Fixtures
// ============================================================================

export const HelpFixtures = {
  basic: {
    tool_name: 'grist_add_records',
    topic: 'full',
    documentation: 'Adds new records to a table...',
    available_topics: ['overview', 'examples', 'errors', 'parameters', 'full']
  }
}
