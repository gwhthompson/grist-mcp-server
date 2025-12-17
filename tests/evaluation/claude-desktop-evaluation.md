# Grist MCP Server Evaluation Prompt

Use this prompt with Claude Desktop to comprehensively test the Grist MCP server functionality.

---

## Evaluation Prompt

You have access to a Grist MCP server. I want you to thoroughly test all available tools by completing the following tasks. For each task, explain what you're doing, show the tool calls you make, and report any issues or unexpected behavior.

### Phase 1: Discovery and Navigation

**Task 1.1 - List Workspaces**
List all available workspaces and note their IDs and names.

**Task 1.2 - List Documents**
For each workspace found, list the documents it contains. Note document IDs.

**Task 1.3 - Explore Help System**
Use the help tool to get documentation for:
- The `grist_manage_records` tool
- The `grist_manage_schema` tool

Note if the help output is clear and actionable.

### Phase 2: Create a Test Database

**Task 2.1 - Create Document**
Create a new document called "MCP_Evaluation_Test" in an available workspace.

**Task 2.2 - Design Schema**
Create a table called "Contacts" with these columns:
- `Name` (Text, required)
- `Email` (Text)
- `Phone` (Text)
- `Status` (Choice with options: "Active", "Inactive", "Pending")
- `Priority` (Integer)
- `Notes` (Text)
- `CreatedAt` (Date)

**Task 2.3 - Verify Schema**
Use `grist_get_tables` with `detail_level='columns'` to verify the schema was created correctly.

### Phase 3: Data Operations

**Task 3.1 - Add Records**
Add 5 sample contacts with varied data:
1. Alice Johnson, alice@example.com, Active, Priority 1
2. Bob Smith, bob@example.com, Pending, Priority 2
3. Carol Davis, carol@example.com, Active, Priority 1
4. David Wilson, david@example.com, Inactive, Priority 3
5. Eve Brown, eve@example.com, Active, Priority 2

**Task 3.2 - Read Records**
Fetch all records from the Contacts table.

**Task 3.3 - Filter Records**
Fetch only contacts where:
- Status is "Active"
- Priority is 1

**Task 3.4 - Update Records**
Update Bob Smith's status from "Pending" to "Active".

**Task 3.5 - Delete Record**
Delete Eve Brown from the contacts.

### Phase 4: SQL Queries

**Task 4.1 - Basic SQL**
Run a SQL query to get all Active contacts ordered by Priority.

**Task 4.2 - Aggregation SQL**
Run a SQL query to count contacts by Status.

**Task 4.3 - Parameterized Query (if supported)**
Try a parameterized query: `SELECT * FROM Contacts WHERE Status = ?` with parameter "Active".

### Phase 5: Schema Modifications

**Task 5.1 - Add Column**
Add a new column called "Company" (Text type) to the Contacts table.

**Task 5.2 - Rename Column**
Rename the "Notes" column to "Comments".

**Task 5.3 - Delete Column**
Delete the "Phone" column from the Contacts table.

**Task 5.4 - Verify Changes**
List the table schema again to verify all changes were applied.

### Phase 6: Page Management

**Task 6.1 - List Pages**
Get the current page structure of the document.

**Task 6.2 - Create Page (if supported)**
Try to create a new page or view for the Contacts table.

### Phase 7: Webhook Management (Optional)

**Task 7.1 - List Webhooks**
List any existing webhooks on the document.

**Task 7.2 - Webhook Operations**
If possible, demonstrate creating and then deleting a test webhook.

### Phase 8: Error Handling

**Task 8.1 - Invalid Document ID**
Try to get tables from a non-existent document ID. Report the error message.

**Task 8.2 - Invalid Table Name**
Try to get records from a non-existent table. Report the error message.

**Task 8.3 - Invalid Column in Filter**
Try to filter by a column that doesn't exist. Report the error message.

### Phase 9: nextSteps Verification

For each tool response, note:
- Does the response include a `nextSteps` field?
- Are the suggested next steps relevant and helpful?
- Do the suggestions guide you toward logical follow-up actions?

### Evaluation Report

After completing all tasks, provide a summary report with:

1. **Tool Coverage**: Which tools were successfully tested?
2. **Issues Found**: Any bugs, unclear errors, or unexpected behavior?
3. **nextSteps Quality**: How useful were the nextSteps suggestions?
4. **Documentation Quality**: Was the help output sufficient?
5. **Overall Experience**: Rate the MCP server usability (1-10) and explain.

---

## Expected Tools

The MCP server should provide these 11 tools:

| Tool | Purpose | Core? |
|------|---------|-------|
| `grist_get_workspaces` | List workspaces | ✓ |
| `grist_get_documents` | List documents in workspace | ✓ |
| `grist_get_tables` | List tables/columns in document | ✓ |
| `grist_get_records` | Fetch records with filters | ✓ |
| `grist_manage_records` | Add/update/delete records | ✓ |
| `grist_manage_schema` | Create/modify tables and columns | ✓ |
| `grist_query_sql` | Run SQL queries | |
| `grist_manage_pages` | Manage pages and views | |
| `grist_create_document` | Create new documents | |
| `grist_manage_webhooks` | Webhook CRUD operations | |
| `grist_help` | Get tool documentation | |

## Success Criteria

The evaluation is successful if:
- [ ] All 6 core tools function correctly
- [ ] CRUD operations work (create, read, update, delete records)
- [ ] Schema operations work (add/modify/delete columns)
- [ ] SQL queries return expected results
- [ ] Error messages are clear and actionable
- [ ] nextSteps suggestions appear in responses
- [ ] Help documentation is accessible and useful
