import { createTable } from './dist/tools/tables.js';
import { createTestClient } from './dist/tests/helpers/grist-api.js';

const client = createTestClient();

// Use your test doc from the test suite
const docId = process.env.TEST_DOC_ID || 'cH9URipXMdN6VD6BmE6G4M';

console.log('Testing complex widgetOptions...\n');

try {
  console.log('Attempting to create table with complex widgetOptions:');
  const widgetOptions = {
    alignment: 'center',
    wrap: true,
    fontBold: true,
    textColor: '#FF0000',
    fillColor: '#FFFF00'
  };
  console.log('Input widgetOptions:', JSON.stringify(widgetOptions, null, 2));

  const result = await createTable(client, {
    docId,
    tableName: 'TestComplexWidget',
    columns: [{
      colId: 'Name',
      type: 'Text',
      widgetOptions
    }],
    response_format: 'json'
  });

  console.log('\n✅ Table created successfully!');
  console.log('Result:', JSON.stringify(result, null, 2));

  // Now fetch the actual stored value
  console.log('\n📖 Reading back from Grist API...');
  const columnsResponse = await client.get(`/docs/${docId}/tables/TestComplexWidget/columns`);
  const nameCol = columnsResponse.columns.find(c => c.id === 'Name');

  console.log('\nStored widgetOptions (raw string):');
  console.log(nameCol.fields.widgetOptions);

  console.log('\nParsed widgetOptions:');
  const parsed = JSON.parse(nameCol.fields.widgetOptions);
  console.log(JSON.stringify(parsed, null, 2));

  console.log('\n✅ All properties present:', Object.keys(parsed));

} catch (error) {
  console.error('\n❌ Error:', error.message);
  if (error.response) {
    console.error('Response:', error.response.data);
  }
  if (error.cause) {
    console.error('Cause:', error.cause);
  }
  process.exit(1);
}
