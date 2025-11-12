#!/usr/bin/env node
/**
 * Test actual tool call through MCP protocol
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

console.log('🔧 Testing Tool Call\n');

// Start the server
const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    GRIST_API_KEY: 'test-key-for-tool-test',
    GRIST_BASE_URL: 'https://docs.getgrist.com'
  }
});

let stdout = '';
let stderr = '';

server.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  if (text.includes('"error"')) {
    console.log('[ERROR RESPONSE]', text.trim());
  }
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  stderr += text;
  if (text.includes('[DEBUG]')) {
    console.log('[STDERR]', text.trim());
  }
});

// Wait for server to start
await delay(2000);

console.log('📤 Sending tools/call request for grist_get_workspaces...\n');

// Send MCP tools/call request
const toolCallRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'grist_get_workspaces',
    arguments: {
      limit: 5
    }
  }
};

server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

// Wait for response
await delay(3000);

console.log('📊 Response:\n');

// Parse response
try {
  const lines = stdout.split('\n').filter(l => l.trim() && l.startsWith('{'));
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      if (response.id === 2) {
        console.log('Tool Call Response:');
        console.log(JSON.stringify(response, null, 2));

        if (response.error) {
          console.log('\n❌ ERROR DETECTED:');
          console.log('Message:', response.error.message);
          console.log('Code:', response.error.code);
        } else if (response.result) {
          console.log('\n✅ SUCCESS');
        }
      }
    } catch {}
  }
} catch (error) {
  console.log('❌ Parse error:', error.message);
}

// Cleanup
server.kill();
process.exit(0);
