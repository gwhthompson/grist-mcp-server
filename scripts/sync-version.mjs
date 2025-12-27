#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))

// Sync version
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version
  writeFileSync('./manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ manifest.json version synced to ${pkg.version}`)
} else {
  console.log(`✓ Version in sync: ${pkg.version}`)
}

// Sync server.json for MCP Registry
const serverJsonPath = './server.json'
if (existsSync(serverJsonPath)) {
  const serverJson = JSON.parse(readFileSync(serverJsonPath, 'utf8'))
  let updated = false
  if (serverJson.version !== pkg.version) {
    serverJson.version = pkg.version
    updated = true
  }
  if (serverJson.packages?.[0]?.version !== pkg.version) {
    serverJson.packages[0].version = pkg.version
    updated = true
  }
  if (updated) {
    writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2) + '\n')
    console.log(`✓ server.json version synced to ${pkg.version}`)
  }
}

// Note: Tool count validation happens in generate.mjs which has access to ALL_TOOLS
// The manifest is auto-generated from ALL_TOOLS, so count should always match
