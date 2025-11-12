#!/usr/bin/env node
/**
 * Test if zodToJsonSchema mutates the original schema
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

console.log('🧪 Testing Zod Schema Conversion\n');

// Create a simple Zod schema
const TestSchema = z.object({
  name: z.string(),
  age: z.number()
}).strict();

console.log('1. Original schema type:', TestSchema.constructor.name);
console.log('2. Can parse with original:', TestSchema.safeParse({ name: 'test', age: 25 }).success);

// Convert to JSON Schema
const jsonSchema = zodToJsonSchema(TestSchema, {
  name: 'TestSchema',
  target: 'jsonSchema7'
});

console.log('\n3. After conversion:');
console.log('   - JSON Schema created:', typeof jsonSchema === 'object');
console.log('   - Original schema type:', TestSchema.constructor.name);
console.log('   - Can still parse:', TestSchema.safeParse({ name: 'test', age: 25 }).success);

// Check if schema was mutated
console.log('\n4. Checking for mutation:');
try {
  const result = TestSchema.safeParse({ name: 'Alice', age: 30 });
  console.log('   ✅ Schema still works:', result.success);
  if (!result.success) {
    console.log('   ❌ Error:', result.error.message);
  }
} catch (error) {
  console.log('   ❌ MUTATION DETECTED:', error.message);
}

console.log('\n5. Checking internal structure:');
console.log('   - Schema has _def:', '_def' in TestSchema);
console.log('   - Schema has _parse:', '_parse' in TestSchema);
console.log('   - Schema has safeParse:', 'safeParse' in TestSchema);

if (TestSchema._def && TestSchema._def.shape) {
  console.log('   - Shape exists:', true);
  const keys = Object.keys(TestSchema._def.shape());
  console.log('   - Shape keys:', keys);
  for (const key of keys) {
    const validator = TestSchema._def.shape()[key];
    console.log(`   - ${key} validator type:`, validator.constructor.name);
    console.log(`     has _parse:`, '_parse' in validator);
  }
}
