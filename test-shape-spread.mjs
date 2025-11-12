#!/usr/bin/env node
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

console.log('🧪 Testing .shape spreading\n');

const BaseSchema = z.object({
  offset: z.number().default(0),
  limit: z.number().default(100)
});

console.log('1. BaseSchema.shape type:', typeof BaseSchema.shape);
console.log('2. Is it a function?:', typeof BaseSchema.shape === 'function');

// WRONG WAY - spreading .shape
const WrongSchema = z.object({
  name: z.string(),
  ...BaseSchema.shape
}).strict();

console.log('\n3. Testing WRONG way (...BaseSchema.shape):');
try {
  const result = WrongSchema.safeParse({ name: 'test', limit: 5 });
  console.log('   Parse result:', result.success);
  if (!result.success) {
    console.log('   Error:', result.error.issues[0].message);
  }
} catch (error) {
  console.log('   ❌ Exception:', error.message);
}

// Check internal structure
console.log('\n4. Checking WrongSchema internal structure:');
if (WrongSchema._def && WrongSchema._def.shape) {
  const shapeObj = WrongSchema._def.shape();
  const keys = Object.keys(shapeObj);
  console.log('   Keys:', keys);
  for (const key of keys) {
    const validator = shapeObj[key];
    console.log(`   ${key}:`, validator?.constructor?.name || typeof validator);
    console.log(`     has _parse:`, validator && '_parse' in validator);
  }
}

// Convert to JSON Schema
console.log('\n5. Converting to JSON Schema:');
try {
  const jsonSchema = zodToJsonSchema(WrongSchema);
  console.log('   ✅ Conversion succeeded');
} catch (error) {
  console.log('   ❌ Conversion failed:', error.message);
}

// RIGHT WAY - using .merge()
const RightSchema = z.object({
  name: z.string()
}).merge(BaseSchema).strict();

console.log('\n6. Testing RIGHT way (.merge()):');
try {
  const result = RightSchema.safeParse({ name: 'test', limit: 5, offset: 0 });
  console.log('   Parse result:', result.success);
  if (result.success) {
    console.log('   ✅ Parsed data:', result.data);
  }
} catch (error) {
  console.log('   ❌ Exception:', error.message);
}
