#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

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

// Note: Tool count validation happens in generate.mjs which has access to ALL_TOOLS
// The manifest is auto-generated from ALL_TOOLS, so count should always match
