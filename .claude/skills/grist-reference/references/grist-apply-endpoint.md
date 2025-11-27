# Guide to Verifying Actions Applied via the `/apply` REST API Endpoint

This guide covers how to verify the success of actions applied using the `/api/docs/{docId}/apply` endpoint in Grist, including response structure, error handling, and status verification.

## Endpoint Overview

**Endpoint:** `POST /api/docs/{docId}/apply`

**Authentication:** Requires edit permissions on the document

**Request Body:** Array of UserAction arrays
```typescript
[
  ['AddTable', 'TableName', [{id: 'ColumnA'}, {id: 'ColumnB'}]],
  ['BulkAddRecord', 'TableName', [1, 2], {ColumnA: ["value1", "value2"]}]
]
```

## Success Response Structure

### The `ApplyUAResult` Interface

When actions are successfully applied, the endpoint returns an `ApplyUAResult` object with the following structure:

```typescript
interface ApplyUAResult {
  actionNum: number;         // Sequential number of the action that got recorded
  actionHash: string | null; // Hash of the action that got recorded
  retValues: any[];          // Array of return values, one for each passed-in user action
  isModification: boolean;   // true if document was modified
}
```

### HTTP Status Code

**Success:** `200 OK`

### Example Success Response

```json
{
  "actionNum": 42,
  "actionHash": "a1b2c3d4e5f6...",
  "retValues": [123, [1, 2, 3]],
  "isModification": true
}
```

## Response Fields Explained

### 1. `actionNum` (number)

- **Purpose:** Unique sequential identifier for the action bundle in the document's history
- **Usage:** Can be used to reference this action in undo/redo operations
- **Always present:** Yes
- **Example:** `42`

### 2. `actionHash` (string | null)

- **Purpose:** Cryptographic hash of the action for integrity verification
- **Value:** SHA hash string or `null` in certain edge cases
- **Usage:** Used for action verification and synchronization
- **Example:** `"a1b2c3d4e5f6789..."`

### 3. `retValues` (any[])

- **Purpose:** Contains return values from each user action
- **Structure:** Array with one element per action in the request
- **Length:** Matches the number of actions sent
- **Content varies by action type:**
  - `AddTable`: Returns `{table_id: string, id: number, columns: string[], views: object[]}`
  - `AddRecord`: Returns the row ID (number) of the created record
  - `BulkAddRecord`: Returns array of row IDs created
  - `UpdateRecord` / `BulkUpdateRecord`: Returns `null`
  - `RemoveRecord` / `BulkRemoveRecord`: Returns `null`

⚠️ **Safety Warning:** Always validate `retValues` exists and has expected length before accessing elements. Accessing undefined array elements can cause application crashes. See Best Practices section below for safe access patterns.

**Example:**
```javascript
// Request: [['AddRecord', 'Table1', null, {A: 1}], ['AddRecord', 'Table1', null, {A: 2}]]
// Response retValues: [1, 2]  // The new row IDs
```

### 4. `isModification` (boolean)

- **Purpose:** Indicates whether the document was actually modified
- **Values:**
  - `true`: Document state changed (actions were stored)
  - `false`: No change to document (e.g., noop actions)
- **Note:** Even failed actions that are reverted may still have `isModification: true` if non-deterministic side effects occurred

## Verifying Success

### Basic Verification Steps

1. **Check HTTP Status Code**
   ```javascript
   if (response.status === 200) {
     // Success
   }
   ```

2. **Verify Response Structure**
   ```javascript
   const result = response.data;
   if (result.actionNum && result.retValues) {
     // Valid response received
   }
   ```

3. **Check `isModification` Flag**
   ```javascript
   if (result.isModification) {
     console.log('Document was modified');
   } else {
     console.log('No changes made to document');
   }
   ```

4. **Validate Return Values**
   ```javascript
   // For AddRecord actions, check if row IDs were returned
   const newRowIds = result.retValues.filter(v => typeof v === 'number');
   console.log(`Created ${newRowIds.length} records`);
   ```

### Query Parameter: `noparse`

The endpoint accepts an optional query parameter that affects string parsing:

- **`?noparse=1`**: Disables string parsing (strings are stored as-is)
- **Default (no parameter):** String values are parsed based on column type (`parseStrings: true`)

**Example:**
```
POST /api/docs/{docId}/apply?noparse=1
```

**Note:** The default behavior parses strings according to column types, which means string values like `"1"` may be converted to numbers if the column type is numeric. Use `noparse=1` to preserve values exactly as sent.

## Error Handling

### Error Response Structure

When an error occurs, you'll receive a response with:
- **HTTP Status Code:** `4xx` or `5xx`
- **Response Body:**
  ```json
  {
    "error": "Error message description"
  }
  ```

### Common Error Scenarios

#### 1. Permission Denied (403)

**Response:**
```json
{
  "error": "No write access"
}
```

**Cause:** User lacks edit permissions on the document

**Verification:**
```javascript
if (response.status === 403) {
  console.error('Insufficient permissions');
}
```

#### 2. Invalid Action (400)

**Response:**
```json
{
  "error": "Invalid payload",
  "userError": "Detailed error message"
}
```

**Causes:**
- Malformed action array
- Invalid action name
- Type mismatches
- Constraint violations

#### 3. Document Not Found (404)

**Response:**
```json
{
  "error": "Document not found"
}
```

**Cause:** Invalid `docId` or document was deleted

#### 4. Rate Limiting (429)

**Response:** HTTP 429 status

**Cause:** Too many parallel requests (default limit: 10 concurrent requests per document)

**Configuration:** Can be adjusted via `GRIST_MAX_PARALLEL_REQUESTS_PER_DOC` environment variable (set to 0 for unlimited)

**Recovery:** Retry with exponential backoff

#### 5. Data Limit Exceeded

**Response:**
```json
{
  "error": "Document is in delete-only mode"
}
```

**Cause:** Document has exceeded data limits and is restricted

**Allowed Actions in Delete-Only Mode:**
- `RemoveTable`
- `RemoveColumn`
- `RemoveRecord`
- `BulkRemoveRecord`
- `RemoveViewSection`
- `RemoveView`
- `ApplyUndoActions`
- `RespondToRequests`

**Note:** All other actions will be rejected when the document is in delete-only mode. This restriction is enforced before actions reach the data engine.

### Access Control Errors

Actions are subject to granular access control rules. If an action violates access rules:

1. The action is **reverted** from the data engine
2. An error is thrown with details
3. The `ApplyUAResult` may still be returned with revert actions if non-deterministic functions were executed

**Important:** Even if an error occurs, `actionNum` and `actionHash` may be present if partial application occurred before the error.

## Advanced Verification

### Action Bundling

Actions sent in a single request are treated as a bundle:

- All actions share the same `actionNum`
- The `linkId` field connects bundled actions
- If one action in a bundle fails, the entire bundle may be reverted

### Checking Action Persistence

After receiving a success response, verify the action persisted:

```javascript
// 1. Check the action was recorded
if (result.actionNum > 0) {
  console.log(`Action recorded with number: ${result.actionNum}`);
}

// 2. Verify data by querying the table
const tableData = await fetch(`/api/docs/${docId}/tables/${tableId}/data`);
// Validate the expected changes are present
```

### Handling Partial Success

The `retValues` array provides granular success information:

```javascript
result.retValues.forEach((retValue, index) => {
  if (retValue !== null) {
    console.log(`Action ${index} succeeded with result:`, retValue);
  } else {
    console.log(`Action ${index} completed (no return value)`);
  }
});
```

## Example: Complete Verification Flow

```javascript
async function applyAndVerifyActions(docId, actions) {
  try {
    // Apply actions
    const response = await axios.post(
      `/api/docs/${docId}/apply`,
      actions,
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Check HTTP status
    if (response.status !== 200) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    const result = response.data;

    // Validate response structure
    if (!result.actionNum || !Array.isArray(result.retValues)) {
      throw new Error('Invalid response structure');
    }

    // Check if document was modified
    if (!result.isModification) {
      console.warn('No modifications made to document');
      return { success: true, modified: false };
    }

    // Verify return values match action count
    if (result.retValues.length !== actions.length) {
      throw new Error('Return value count mismatch');
    }

    // Log success details
    console.log('Actions applied successfully:', {
      actionNum: result.actionNum,
      actionHash: result.actionHash,
      modificationsCount: result.retValues.filter(v => v !== null).length
    });

    return {
      success: true,
      modified: true,
      actionNum: result.actionNum,
      retValues: result.retValues
    };

  } catch (error) {
    // Handle errors
    if (error.response) {
      const status = error.response.status;
      const errorMsg = error.response.data?.error || 'Unknown error';

      console.error(`Action failed (${status}):`, errorMsg);

      // Specific error handling
      switch (status) {
        case 403:
          return { success: false, reason: 'permission_denied' };
        case 404:
          return { success: false, reason: 'document_not_found' };
        case 429:
          return { success: false, reason: 'rate_limited', retry: true };
        default:
          return { success: false, reason: 'unknown', error: errorMsg };
      }
    }

    throw error;
  }
}
```

## Best Practices

1. **Always check HTTP status code first** before parsing the response
2. **Validate `retValues` length** matches your action count
3. **Use `actionNum`** to track actions in your application
4. **Handle rate limiting** with exponential backoff
5. **Check `isModification`** to detect noop actions
6. **Parse `retValues`** according to the specific actions sent
7. **Implement error recovery** for permission and validation errors
8. **Verify data** with follow-up queries for critical operations
9. **Consider using `noparse=1`** when you need exact string preservation
10. **Validate `retValues` structure before access** to prevent crashes:
    ```typescript
    // ❌ UNSAFE - Can crash if retValues is undefined or malformed
    const ids = response.retValues?.[0] || []

    // ✅ SAFE - Validates structure before accessing elements
    if (!Array.isArray(response.retValues) || response.retValues.length === 0) {
      throw new Error(
        `Invalid response: expected retValues array with ${actions.length} elements. ` +
        `Grist API may have rejected the action.`
      )
    }

    // Now safe to access
    const result = response.retValues[0]

    // For operations that return data (AddRecord, BulkAddRecord, AddTable):
    if (result === undefined || result === null) {
      throw new Error(
        `Action returned no value. Expected row IDs for BulkAddRecord. ` +
        `This may indicate a silent failure.`
      )
    }

    const ids = result  // Type-safe access
    ```

## Related Endpoints

- **GET** `/api/docs/{docId}/tables/{tableId}/data` - Verify data after applying actions
- **POST** `/api/docs/{docId}/tables/{tableId}/data` - Alternative endpoint for adding records
- **PATCH** `/api/docs/{docId}/tables/{tableId}/records` - Update specific records

## Configuration

### Rate Limiting
- **Default:** 10 concurrent requests per document
- **Environment Variable:** `GRIST_MAX_PARALLEL_REQUESTS_PER_DOC`
- **Set to 0:** For unlimited concurrent requests
- **Note:** This limit applies per document, not per user

### String Parsing
- **Default Behavior:** Strings are parsed based on column types
- **To Disable:** Add `?noparse=1` query parameter
- **Affects:** How string values in actions are interpreted and stored

## Limitations

- Maximum concurrent requests per document (default: 10, configurable)
- Actions must respect document access control rules
- Some actions restricted when document exceeds data limits (delete-only mode)
- The rate limit is enforced per document across all users

---

## Validation Results

**Tested Against:** Grist Docker instance (localhost:8989)
**Test Date:** 2025-11-22

**Validation Test Files:**
- `tests/validation/apply-response-structure.test.ts` - Validates all 4 response fields and retValues structure (11/11 tests passed)
- `tests/validation/apply-error-responses.test.ts` - Validates error handling and transformation (error tests show GristClient properly transforms errors to actionable messages)

### ✅ CONFIRMED Behaviors (11/11 Structure Tests Passed)

1. **Response Structure** - All 4 fields present and correctly typed:
   - `actionNum`: number (positive integer, sequential)
   - `actionHash`: string (20+ character hash) | null
   - `retValues`: array (length matches action count)
   - `isModification`: boolean

2. **retValues Content by Action Type:**
   - `AddRecord`: Returns row ID (number) - ✅ Confirmed
   - `BulkAddRecord`: Returns array of row IDs (number[]) - ✅ Confirmed
   - `UpdateRecord`: Returns null - ✅ Confirmed
   - `AddTable`: Returns metadata object with `table_id`, `id`, `columns` - ✅ Confirmed

3. **Action Bundling:**
   - Multiple actions in single request share same `actionNum` - ✅ Confirmed
   - `retValues` array has one element per action - ✅ Confirmed
   - Actions execute in order with correct return values - ✅ Confirmed

4. **Sequential Behavior:**
   - `actionNum` increments by 1 between separate requests - ✅ Confirmed

### ⚠️ ACTUAL BEHAVIOR DIFFERS FROM DOCUMENTATION

1. **String Parsing (noparse parameter):**
   - **Documented:** Default behavior parses strings ("123" → 123 for numeric columns)
   - **ACTUAL:** Strings are NOT automatically parsed - "999" stays as string "999"
   - **ACTUAL:** Both with and without `noparse=1` preserve strings as-is
   - **Conclusion:** String-to-type parsing may occur elsewhere (not in /apply endpoint)

2. **Type Mismatch Errors:**
   - **Documented:** Type mismatches may cause 400/500 errors
   - **ACTUAL:** Sending text to numeric column does NOT throw immediate error
   - **Conclusion:** Grist may accept mismatched types and handle gracefully

3. **Formula Validation:**
   - **Documented:** Invalid formulas should be rejected
   - **ACTUAL:** Invalid formula syntax (`INVALID_FUNCTION()`) does not cause immediate error
   - **Conclusion:** Formula errors occur at evaluation time, not creation time

### ❌ NOT TESTED (Requires Specific Conditions)

1. **Rate Limiting (429 errors):** Requires 10+ concurrent requests - not tested
2. **Delete-Only Mode:** Requires exceeding data limits - not tested
3. **Permission Errors (403):** Current test uses admin API key - not tested
4. **Access Control Violations:** Requires granular ACL setup - not tested

---

**Note:** Error response tests (400, 404, 500) showed that GristClient transforms errors before tests can inspect raw axios responses. This is expected behavior - the client provides actionable error messages instead of raw API responses.

**Source:** Empirical testing against Grist API + Grist source code analysis

**Date Created:** 2025-11-22
**Validated By:** gwhthompson
**Validation Date:** 2025-11-22
