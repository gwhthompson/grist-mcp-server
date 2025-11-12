#!/usr/bin/env node
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const PaginationSchema = z.object({
  offset: z.number().default(0),
  limit: z.number().default(100)
}).strict();

const TestSchema = z.object({
  name: z.string(),
  response_format: z.string()
}).merge(PaginationSchema).strict();

console.log('1. Testing schema before conversion...');
const result1 = TestSchema.safeParse({ name: 'test', response_format: 'json', limit: 5 });
console.log('   Success:', result1.success);

console.log('\n2. Converting to JSON Schema...');
const jsonSchema = zodToJsonSchema(TestSchema, { target: 'jsonSchema7' });
console.log('   JSON Schema keys:', Object.keys(jsonSchema));

console.log('\n3. Testing schema after conversion...');
try {
  const result2 = TestSchema.safeParse({ name: 'test', response_format: 'json', limit: 5 });
  console.log('   Success:', result2.success);
  if (!result2.success) {
    console.log('   Error:', result2.error.message);
  }
} catch (error) {
  console.log('   EXCEPTION:', error.message);
  console.log('   Stack:', error.stack);
}

console.log('\n4. Checking schema integrity...');
console.log('   Has _def:', '_def' in TestSchema);
console.log('   Has safeParse:', 'safeParse' in TestSchema);
if (TestSchema._def && TestSchema._def.schema && TestSchema._def.schema._def) {
  const innerDef = TestSchema._def.schema._def;
  if (innerDef.shape) {
    const shape = innerDef.shape();
    console.log('   Shape keys:', Object.keys(shape));
    for (const key of Object.keys(shape)) {
      const val = shape[key];
      console.log(`   ${key}: type=${val?.constructor?.name}, has _parse=${val && '_parse' in val}`);
    }
  }
}
