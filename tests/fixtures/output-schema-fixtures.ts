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
    hasMore: false,
    nextOffset: null
  },
  withWorkspaces: {
    items: [
      {
        id: 1,
        name: 'Personal',
        org: 'personal',
        orgDomain: 'docs',
        docCount: 5,
        access: 'owners'
      },
      {
        id: 2,
        name: 'Team Workspace',
        org: 'team-org',
        orgDomain: 'team',
        docCount: 10,
        access: 'editors',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-06-20T14:45:00Z'
      }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  }
}

export const GetDocumentsFixtures = {
  minimal: {
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  },
  withDocuments: {
    items: [
      {
        docId: 'fdCVLvgAPAD1HXhQcGHCyz',
        name: 'Customer CRM',
        workspace: 'Personal',
        workspaceId: 1,
        access: 'owners',
        url: 'https://docs.getgrist.com/fdCVLvgAPAD1HXhQcGHCyz'
      },
      {
        docId: 'abc123def456ghi789jkl0',
        name: 'Sales Report',
        workspace: { id: 2, name: 'Team Workspace' },
        workspaceId: 2,
        access: 'editors',
        isPinned: true,
        createdAt: '2024-03-10T08:00:00Z',
        updatedAt: '2024-06-25T16:30:00Z',
        public: false
      }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  }
}

export const GetTablesFixtures = {
  minimal: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableCount: 0,
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null,
    pageNumber: 1,
    totalPages: 0,
    itemsInPage: 0
  },
  withTables: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableCount: 2,
    items: [
      { id: 'Customers', columns: ['Name', 'Email', 'Phone'] },
      { id: 'Orders', columns: ['OrderId', 'Customer', 'Amount', 'Date'] }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null,
    pageNumber: 1,
    totalPages: 1,
    itemsInPage: 2
  },
  fullSchema: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableCount: 1,
    items: [
      {
        id: 'Customers',
        columns: [
          {
            id: 'Name',
            label: 'Name',
            type: 'Text',
            isFormula: false,
            formula: null,
            widgetOptions: null,
            visibleCol: null,
            visibleColName: null
          },
          {
            id: 'Email',
            label: 'Email',
            type: 'Text',
            isFormula: false,
            formula: null,
            widgetOptions: { widget: 'HyperLink' },
            visibleCol: null,
            visibleColName: null
          }
        ]
      }
    ],
    total: 1,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null,
    pageNumber: 1,
    totalPages: 1,
    itemsInPage: 1
  }
}

// ============================================================================
// Reading Tool Fixtures
// ============================================================================

export const GetRecordsFixtures = {
  minimal: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    items: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  },
  withRecords: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    items: [
      { id: 1, Name: 'Alice', Email: 'alice@example.com' },
      { id: 2, Name: 'Bob', Email: 'bob@example.com' }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null,
    filters: { Status: 'Active' },
    columns: ['Name', 'Email']
  },
  withFormulaErrors: {
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Calculations',
    items: [{ id: 1, Value: 10, Result: null }],
    total: 1,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null,
    formulaErrors: {
      recordsWithErrors: 1,
      affectedColumns: ['Result']
    }
  }
}

export const QuerySqlFixtures = {
  minimal: {
    records: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  },
  withResults: {
    records: [
      { Name: 'Alice', Count: 5, Total: 250.0 },
      { Name: 'Bob', Count: 3, Total: 150.0 }
    ],
    total: 2,
    offset: 0,
    limit: 100,
    hasMore: false,
    nextOffset: null
  }
}

// ============================================================================
// Record Operation Fixtures
// ============================================================================

export const AddRecordsFixtures = {
  single: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsAdded: 1,
    recordIds: [1],
    message: 'Successfully added 1 record'
  },
  multiple: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsAdded: 3,
    recordIds: [1, 2, 3]
  }
}

export const UpdateRecordsFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsUpdated: 2,
    message: 'Successfully updated 2 records'
  }
}

export const UpsertRecordsFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsProcessed: 5,
    recordIds: [1, 2, 3, 4, 5],
    message: 'Upsert completed successfully',
    note: '3 records updated, 2 records added'
  }
}

export const DeleteRecordsFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsDeleted: 2,
    message: 'Successfully deleted 2 records'
  },
  withWarning: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    recordsDeleted: 0,
    warning: 'No records matched the provided IDs'
  }
}

// ============================================================================
// Table Operation Fixtures
// ============================================================================

export const CreateTableFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'NewTable',
    tableName: 'NewTable',
    columnsCreated: 3,
    message: 'Table created successfully',
    url: 'https://docs.getgrist.com/fdCVLvgAPAD1HXhQcGHCyz/p/1'
  },
  withWarnings: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Products',
    tableName: 'Products',
    columnsCreated: 2,
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
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    oldTableId: 'OldName',
    newTableId: 'NewName',
    message: 'Table renamed successfully'
  }
}

export const DeleteTableFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'DeletedTable',
    message: 'Table deleted successfully'
  }
}

export const CreateSummaryTableFixtures = {
  basic: {
    success: true as const,
    summaryTableId: 'Sales_summary_Region_Year',
    sourceTable: 'Sales',
    groupByColumns: ['Region', 'Year'],
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
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    operationsPerformed: 1,
    actions: ['Added column Phone (Text)'],
    summary: { added: 1, modified: 0, deleted: 0, renamed: 0 },
    message: 'Successfully completed 1 operation'
  },
  multipleOperations: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Customers',
    operationsPerformed: 3,
    actions: [
      'Added column Phone (Text)',
      'Modified column Email widgetOptions',
      'Renamed column Addr to Address'
    ],
    summary: { added: 1, modified: 1, deleted: 0, renamed: 1 },
    message: 'All operations completed successfully',
    details: ['Phone: Created as Text type', 'Email: Updated widget to HyperLink'],
    hint: 'Use grist_get_tables to verify changes'
  }
}

export const ManageConditionalRulesFixtures = {
  add: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Sales',
    scope: 'column',
    action: 'add',
    rulesCount: 2
  },
  list: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    tableId: 'Sales',
    scope: 'column',
    action: 'list',
    rulesCount: 2,
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
    docId: 'newDocId12345678901234',
    documentName: 'New Project',
    workspaceId: 1,
    url: 'https://docs.getgrist.com/newDocId12345678901234',
    forkedFrom: null,
    message: 'Document created successfully',
    nextSteps: ['Create tables with grist_create_table', 'Add records with grist_add_records']
  },
  forked: {
    success: true as const,
    docId: 'forkedDocId12345678901',
    documentName: 'Project Copy',
    workspaceId: 2,
    url: 'https://docs.getgrist.com/forkedDocId12345678901',
    forkedFrom: 'originalDocId123456789'
  }
}

// ============================================================================
// Page/Widget Operation Fixtures
// ============================================================================

export const GetPagesFixtures = {
  minimal: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [],
    rawDataTables: [],
    summary: {
      totalPages: 0,
      totalWidgets: 0,
      totalTables: 0,
      summaryTables: 0
    },
    pagination: {
      total: 0,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    }
  },
  withWidgets: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        pageId: 1,
        pageName: 'Dashboard',
        widgets: [
          {
            widgetId: 101,
            title: 'Customer Grid',
            widgetType: 'grid',
            tableId: 'Customers',
            tableRef: 5,
            isSummaryTable: false
          },
          {
            widgetId: 102,
            title: 'Order Details',
            widgetType: 'card',
            tableId: 'Orders',
            tableRef: 6,
            isSummaryTable: false
          }
        ]
      }
    ],
    rawDataTables: [
      {
        tableId: 'Hidden_Config',
        tableRef: 10,
        isSummaryTable: false,
        referencedOnPages: []
      }
    ],
    summary: {
      totalPages: 1,
      totalWidgets: 2,
      totalTables: 3,
      summaryTables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    }
  },
  withSummaryTables: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        pageId: 1,
        pageName: 'Sales Analysis',
        widgets: [
          {
            widgetId: 201,
            title: 'Sales by Region',
            widgetType: 'grid',
            tableId: 'Sales_summary_Region',
            tableRef: 15,
            isSummaryTable: true,
            summarySourceTable: 'Sales',
            groupByColumns: ['Region']
          }
        ]
      }
    ],
    rawDataTables: [],
    summary: {
      totalPages: 1,
      totalWidgets: 1,
      totalTables: 2,
      summaryTables: 1
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    }
  },
  withLinking: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        pageId: 1,
        pageName: 'Master Detail',
        widgets: [
          {
            widgetId: 301,
            title: 'Customers',
            widgetType: 'grid',
            tableId: 'Customers',
            tableRef: 5,
            isSummaryTable: false
          },
          {
            widgetId: 302,
            title: 'Orders',
            widgetType: 'grid',
            tableId: 'Orders',
            tableRef: 6,
            isSummaryTable: false,
            linkedTo: {
              sourceWidgetId: 301,
              sourceColRef: 0,
              targetColRef: 25
            }
          }
        ]
      }
    ],
    rawDataTables: [],
    summary: {
      totalPages: 1,
      totalWidgets: 2,
      totalTables: 2,
      summaryTables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    }
  },
  withChartConfig: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    pages: [
      {
        pageId: 1,
        pageName: 'Charts',
        widgets: [
          {
            widgetId: 401,
            title: 'Sales Chart',
            widgetType: 'chart',
            tableId: 'Sales',
            tableRef: 8,
            isSummaryTable: false,
            chartConfig: {
              chartType: 'bar'
            }
          }
        ]
      }
    ],
    rawDataTables: [],
    summary: {
      totalPages: 1,
      totalWidgets: 1,
      totalTables: 1,
      summaryTables: 0
    },
    pagination: {
      total: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    }
  }
}

export const BuildPageFixtures = {
  basic: {
    success: true as const,
    pageName: 'New Dashboard',
    viewId: 10,
    pattern: 'master_detail',
    description: 'Master-detail page with Customers and Orders',
    widgets: [
      { sectionId: 101, tableRef: 5, position: 'left', title: 'Customers' },
      { sectionId: 102, tableRef: 6, position: 'right', title: 'Orders' }
    ]
  }
}

export const ConfigureWidgetFixtures = {
  basic: {
    success: true as const,
    operationsCompleted: 2,
    summary: ['Linked Orders to Customers', 'Added sort by Date DESC']
  }
}

export const UpdatePageFixtures = {
  basic: {
    success: true as const,
    operationsCompleted: 1,
    summary: ['Renamed page from "Old Name" to "New Name"']
  }
}

// ============================================================================
// Webhook Operation Fixtures
// ============================================================================

export const WebhookListFixtures = {
  empty: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'list' as const,
        webhookCount: 0,
        total: 0,
        offset: 0,
        limit: 100,
        hasMore: false,
        nextOffset: null,
        pageNumber: 1,
        totalPages: 0,
        itemsInPage: 0,
        webhooks: []
      }
    ],
    message: 'Found 0 webhooks'
  },
  withWebhooks: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'list' as const,
        webhookCount: 2,
        total: 2,
        offset: 0,
        limit: 100,
        hasMore: false,
        nextOffset: null,
        pageNumber: 1,
        totalPages: 1,
        itemsInPage: 2,
        webhooks: [
          {
            id: 'webhook-uuid-1234',
            name: 'New Customer Alert',
            url: 'https://hooks.example.com/customers',
            tableId: 'Customers',
            eventTypes: ['add'],
            enabled: true,
            isReadyColumn: null,
            memo: 'Sends notification when new customer added'
          },
          {
            id: 'webhook-uuid-5678',
            name: 'Order Update',
            url: 'https://hooks.example.com/orders',
            tableId: 'Orders',
            eventTypes: ['add', 'update'],
            enabled: true,
            isReadyColumn: 'IsReady',
            memo: null
          }
        ]
      }
    ],
    message: 'Found 2 webhooks'
  }
}

export const WebhookCreateFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'create' as const,
        webhookId: 'new-webhook-uuid',
        webhookUrl: 'https://hooks.example.com/new',
        tableId: 'Customers',
        eventTypes: ['add', 'update']
      }
    ],
    message: 'Successfully completed 1 operation(s)'
  }
}

export const WebhookUpdateFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'update' as const,
        webhookId: 'webhook-uuid-1234',
        fieldsUpdated: ['url', 'enabled']
      }
    ],
    message: 'Successfully completed 1 operation(s)'
  }
}

export const WebhookDeleteFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'delete' as const,
        webhookId: 'webhook-uuid-1234'
      }
    ],
    message: 'Successfully completed 1 operation(s)'
  }
}

export const WebhookClearQueueFixtures = {
  basic: {
    success: true as const,
    docId: 'fdCVLvgAPAD1HXhQcGHCyz',
    operationsCompleted: 1,
    results: [
      {
        action: 'clear_queue' as const,
        success: true
      }
    ],
    message: 'Successfully cleared webhook queue'
  }
}

// ============================================================================
// Utility Tool Fixtures
// ============================================================================

export const HelpFixtures = {
  basic: {
    toolName: 'grist_add_records',
    topic: 'full',
    documentation: 'Adds new records to a table...',
    availableTopics: ['overview', 'examples', 'errors', 'parameters', 'full']
  }
}
