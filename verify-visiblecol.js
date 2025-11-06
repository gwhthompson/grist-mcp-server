// Quick verification script to check visibleCol storage
import { GristClient } from './src/services/grist-client.js'

const client = new GristClient('http://localhost:8989', 'test_api_key')
const docId = 'wvS5x3dSaHfpTYGUUmL9fc'

// Query the metadata
const result = await client.post(`/docs/${docId}/sql`, {
  sql: `SELECT colId, type, visibleCol, widgetOptions
        FROM _grist_Tables_column
        WHERE colId IN ('Manager', 'AssignedTo', 'Reviewers', 'Owner', 'Sponsor', 'TeamMembers')
        ORDER BY colId`,
  args: []
})

console.log('=== visibleCol Storage Verification ===\n')
result.records.forEach(rec => {
  console.log(`Column: ${rec.fields.colId}`)
  console.log(`  Type: ${rec.fields.type}`)
  console.log(`  visibleCol (separate field): ${rec.fields.visibleCol}`)
  console.log(`  widgetOptions: ${rec.fields.widgetOptions || 'null'}`)
  console.log()
})

// Also check if displayCol was auto-created
const allCols = await client.get(`/docs/${docId}/tables/Tasks/columns`)
console.log('\n=== All Tasks Table Columns ===')
allCols.columns.forEach(col => {
  if (col.id.includes('Manager') || col.id.includes('Assigned')) {
    console.log(`${col.id}: type=${col.fields.type}, visibleCol=${col.fields.visibleCol}`)
  }
})
