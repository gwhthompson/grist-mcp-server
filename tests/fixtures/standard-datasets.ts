/**
 * Standard Datasets for Testing
 *
 * Reusable datasets that work across both unit and integration tests.
 * Each dataset defines table structure + records for consistent testing.
 */

import type { CellValue } from '../../src/schemas/api-responses.js'

/**
 * Column definition for datasets
 */
export interface DatasetColumn {
  id: string
  type: string
  label?: string
  widgetOptions?: Record<string, unknown>
  /** For Ref/RefList columns */
  refTable?: string
  visibleCol?: string
}

/**
 * Complete dataset definition
 */
export interface Dataset {
  tableId: string
  columns: DatasetColumn[]
  records: Array<Record<string, CellValue>>
}

// =============================================================================
// Products Dataset - Basic CRUD testing
// =============================================================================

export const PRODUCTS_DATASET: Dataset = {
  tableId: 'Products',
  columns: [
    { id: 'Name', type: 'Text', label: 'Product Name' },
    { id: 'Price', type: 'Numeric', label: 'Price', widgetOptions: { decimals: 2 } },
    {
      id: 'Category',
      type: 'Choice',
      label: 'Category',
      widgetOptions: { choices: ['Electronics', 'Clothing', 'Food'] }
    },
    { id: 'InStock', type: 'Bool', label: 'In Stock' },
    { id: 'Quantity', type: 'Int', label: 'Quantity' }
  ],
  records: [
    { Name: 'Widget', Price: 29.99, Category: 'Electronics', InStock: true, Quantity: 100 },
    { Name: 'Gadget', Price: 49.99, Category: 'Electronics', InStock: true, Quantity: 50 },
    { Name: 'T-Shirt', Price: 19.99, Category: 'Clothing', InStock: false, Quantity: 0 },
    { Name: 'Coffee Beans', Price: 12.99, Category: 'Food', InStock: true, Quantity: 200 }
  ]
}

// =============================================================================
// Employees Dataset - Reference testing
// =============================================================================

export const DEPARTMENTS_DATASET: Dataset = {
  tableId: 'Departments',
  columns: [
    { id: 'Name', type: 'Text', label: 'Department Name' },
    { id: 'Budget', type: 'Numeric', label: 'Annual Budget', widgetOptions: { decimals: 0 } }
  ],
  records: [
    { Name: 'Engineering', Budget: 500000 },
    { Name: 'Sales', Budget: 300000 },
    { Name: 'Marketing', Budget: 200000 }
  ]
}

export const EMPLOYEES_DATASET: Dataset = {
  tableId: 'Employees',
  columns: [
    { id: 'Name', type: 'Text', label: 'Employee Name' },
    { id: 'Email', type: 'Text', label: 'Email Address' },
    {
      id: 'Department',
      type: 'Ref:Departments',
      label: 'Department',
      refTable: 'Departments',
      visibleCol: 'Name'
    },
    { id: 'HireDate', type: 'Date', label: 'Hire Date' },
    { id: 'Salary', type: 'Numeric', label: 'Salary', widgetOptions: { decimals: 2 } }
  ],
  records: [
    {
      Name: 'Alice Johnson',
      Email: 'alice@example.com',
      Department: 1,
      HireDate: 1609459200,
      Salary: 95000
    },
    {
      Name: 'Bob Smith',
      Email: 'bob@example.com',
      Department: 2,
      HireDate: 1612137600,
      Salary: 85000
    },
    {
      Name: 'Carol White',
      Email: 'carol@example.com',
      Department: 3,
      HireDate: 1614556800,
      Salary: 75000
    }
  ]
}

// =============================================================================
// Tasks Dataset - Multi-select and RefList testing
// =============================================================================

export const TASKS_DATASET: Dataset = {
  tableId: 'Tasks',
  columns: [
    { id: 'Title', type: 'Text', label: 'Task Title' },
    {
      id: 'Status',
      type: 'Choice',
      label: 'Status',
      widgetOptions: { choices: ['New', 'In Progress', 'Done', 'Blocked'] }
    },
    {
      id: 'Tags',
      type: 'ChoiceList',
      label: 'Tags',
      widgetOptions: { choices: ['Urgent', 'Feature', 'Bug', 'Documentation'] }
    },
    { id: 'Priority', type: 'Int', label: 'Priority (1-5)' },
    { id: 'DueDate', type: 'Date', label: 'Due Date' }
  ],
  records: [
    {
      Title: 'Fix login bug',
      Status: 'In Progress',
      Tags: ['L', 'Bug', 'Urgent'],
      Priority: 1,
      DueDate: 1704844800
    },
    {
      Title: 'Add dark mode',
      Status: 'New',
      Tags: ['L', 'Feature'],
      Priority: 3,
      DueDate: 1707523200
    },
    {
      Title: 'Update docs',
      Status: 'Done',
      Tags: ['L', 'Documentation'],
      Priority: 4,
      DueDate: 1704067200
    },
    {
      Title: 'Performance audit',
      Status: 'Blocked',
      Tags: ['L', 'Feature', 'Documentation'],
      Priority: 2,
      DueDate: 1710028800
    }
  ]
}

// =============================================================================
// Orders Dataset - Complex relationships
// =============================================================================

export const CUSTOMERS_DATASET: Dataset = {
  tableId: 'Customers',
  columns: [
    { id: 'Name', type: 'Text', label: 'Customer Name' },
    { id: 'Email', type: 'Text', label: 'Email' },
    { id: 'VIP', type: 'Bool', label: 'VIP Customer' }
  ],
  records: [
    { Name: 'Acme Corp', Email: 'orders@acme.com', VIP: true },
    { Name: 'Tech Inc', Email: 'purchasing@tech.com', VIP: false },
    { Name: 'Global Ltd', Email: 'buyer@global.com', VIP: true }
  ]
}

export const ORDERS_DATASET: Dataset = {
  tableId: 'Orders',
  columns: [
    { id: 'OrderNumber', type: 'Text', label: 'Order #' },
    {
      id: 'Customer',
      type: 'Ref:Customers',
      label: 'Customer',
      refTable: 'Customers',
      visibleCol: 'Name'
    },
    {
      id: 'Total',
      type: 'Numeric',
      label: 'Total',
      widgetOptions: { decimals: 2, numMode: 'currency', currency: 'USD' }
    },
    { id: 'OrderDate', type: 'DateTime:UTC', label: 'Order Date' },
    {
      id: 'Status',
      type: 'Choice',
      label: 'Status',
      widgetOptions: { choices: ['Pending', 'Shipped', 'Delivered', 'Cancelled'] }
    }
  ],
  records: [
    {
      OrderNumber: 'ORD-001',
      Customer: 1,
      Total: 299.99,
      OrderDate: 1704945919,
      Status: 'Shipped'
    },
    { OrderNumber: 'ORD-002', Customer: 2, Total: 149.5, OrderDate: 1704859519, Status: 'Pending' },
    {
      OrderNumber: 'ORD-003',
      Customer: 1,
      Total: 599.0,
      OrderDate: 1704773119,
      Status: 'Delivered'
    }
  ]
}

// =============================================================================
// Export all datasets
// =============================================================================

export const ALL_DATASETS = {
  products: PRODUCTS_DATASET,
  departments: DEPARTMENTS_DATASET,
  employees: EMPLOYEES_DATASET,
  tasks: TASKS_DATASET,
  customers: CUSTOMERS_DATASET,
  orders: ORDERS_DATASET
} as const

export type DatasetName = keyof typeof ALL_DATASETS
