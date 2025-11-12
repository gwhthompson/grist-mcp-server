#!/usr/bin/env node
import { z } from 'zod';

const PaginationSchema = z.object({
  offset: z.number().default(0),
  limit: z.number().default(100)
}).strict();

const TestSchema = z.object({
  name: z.string(),
  response_format: z.string()
}).merge(PaginationSchema).strict();

console.log('Testing merged schema...');

try {
  const result = TestSchema.safeParse({
    name: 'test',
    response_format: 'json',
    limit: 5
  });

  console.log('Success:', result.success);
  if (result.success) {
    console.log('Data:', result.data);
  } else {
    console.log('Errors:', result.error.errors);
  }
} catch (error) {
  console.log('ERROR:', error.message);
}
