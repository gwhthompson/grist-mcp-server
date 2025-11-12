#!/usr/bin/env node
/**
 * Test MCP Protocol Communication
 *
 * This script tests if the server properly responds to MCP protocol requests,
 * specifically the tools/list request to see if tools are being advertised.
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

console.log('🔍 Testing MCP Protocol Communication\n');

// Start the server
const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    GRIST_API_KEY: 'test-key-for-protocol-test',
    GRIST_BASE_URL: 'https://docs.getgrist.com'
  }
});

let stdout = '';
let stderr = '';

server.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('[STDOUT]', data.toString().trim());
});

server.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('[STDERR]', data.toString().trim());
});

// Wait for server to start
await delay(2000);

console.log('\n📤 Sending tools/list request...\n');

// Send MCP tools/list request
const toolsListRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

server.stdin.write(JSON.stringify(toolsListRequest) + '\n');

// Wait for response
await delay(2000);

console.log('\n📊 Results:\n');
console.log('STDOUT Output:');
console.log(stdout || '(empty)');
console.log('\nSTDERR Output:');
console.log(stderr || '(empty)');

// Parse response
try {
  const lines = stdout.split('\n').filter(l => l.trim());
  const responses = lines.map(l => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);

  console.log('\n✅ Parsed JSON Responses:');
  console.log(JSON.stringify(responses, null, 2));

  const toolsListResponse = responses.find(r => r.id === 1);
  if (toolsListResponse) {
    console.log('\n🎉 Tools List Response Found!');
    console.log(`Tools count: ${toolsListResponse.result?.tools?.length || 0}`);
    if (toolsListResponse.result?.tools) {
      console.log('\nTools:');
      toolsListResponse.result.tools.forEach((tool, i) => {
        console.log(`  ${i + 1}. ${tool.name}`);
      });
    }
  } else {
    console.log('\n❌ No tools/list response received');
    console.log('This suggests the server is not responding to MCP protocol requests');
  }
} catch (error) {
  console.log('\n❌ Error parsing response:', error.message);
}

// Cleanup
server.kill();
process.exit(0);
