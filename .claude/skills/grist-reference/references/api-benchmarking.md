# Grist API Benchmark: SQL vs Records Endpoints

Comparison of `/api/docs/{docId}/sql` vs `/api/docs/{docId}/tables/{tableId}/records` across 1K, 10K, and 100K rows.

## Summary

| Operation | 1K | 10K | 100K | Winner |
|:----------|:--:|:---:|:----:|:------:|
| Check if name exists | ~13ms | ~12ms | ~20ms | SQL |
| Query by name | ~14ms | ~12ms | ~21ms | Tie |
| **Count rows** | 12 vs 23 | 11 vs 215 | **19 vs 1,443** | **SQL (75x)** |
| Fetch all rows | ~28ms | ~820ms | ~1.4s | Tie |
| **Get row IDs** | 16 vs 27 | 64 vs 259 | **143 vs 1,463** | **SQL (10x)** |
| OR filter (multi-value) | ~15ms | ~51ms | ~25ms | Tie |
| AND filter (multi-column) | ~12ms | ~38ms | ~18ms | Tie |
| Sort ascending | ~22ms | ~450ms | ~1.5s | Tie |
| Sort descending | ~21ms | ~420ms | ~1.6s | Tie |
| **Sort + Limit (Top N)** | 13 vs 16 | 29 vs 89 | **19 vs 484** | **SQL (26x)** |

## Key Findings

**SQL significantly faster for:**
- `COUNT(*)` — 75x faster at 100K rows
- Single column select (`SELECT id`) — 10x faster at 100K rows
- `ORDER BY ... LIMIT` — 26x faster at 100K rows

**Equal performance for:**
- Filtered queries (exact match, OR, AND)
- Full table fetches
- Full table sorts

**Records slightly faster for:**
- Fetching all rows at scale (1.3s vs 1.5s at 100K)

## Capability Differences

| Feature | SQL | Records |
|:--------|:---:|:-------:|
| COUNT/SUM/AVG | Yes | No |
| Select specific columns | Yes | No |
| LIKE pattern matching | Yes | No |
| Range queries (>, <, BETWEEN) | Yes | No |
| JOINs | Yes | No |
| GROUP BY | Yes | No |
| Filter by exact value | Yes | Yes |
| Sort | Yes | Yes |
| Limit | Yes | Yes |

## Recommendations

| Use Case | Use |
|:---------|:----|
| Count rows | SQL |
| Get list of IDs only | SQL |
| Top N sorted results | SQL |
| Aggregations/analytics | SQL |
| Filtered queries | Either |
| Full record retrieval | Either |
| Simple CRUD | Records |

## Test Details

- **Iterations:** 10 per operation
- **Tables:** `Customers_1000`, `Customers_10000`, `Customers_100000`
- **Columns:** `First_Name`, `Last_Name`
- **Method:** `time.perf_counter()` with warmup request
