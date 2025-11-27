#!/usr/bin/env node

/**
 * Generate manifest.json tools and README.md tools table from ALL_TOOLS.
 *
 * This script reads the compiled tool definitions and updates:
 * - package.json: description with tool count
 * - manifest.json: tools array, description with tool count
 * - README.md: intro line with tool count, tools table between markers
 *
 * Usage: node scripts/generate.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/**
 * Load ALL_TOOLS from compiled output.
 */
async function loadTools() {
  const { ALL_TOOLS } = await import(join(ROOT, 'dist/registry/tool-definitions.js'))
  return ALL_TOOLS
}

/**
 * Update package.json description with tool count.
 */
function updatePackageDescription(tools) {
  const pkgPath = join(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  pkg.description = `${tools.length} tools for managing Grist documents with AI`

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`✓ Updated package.json description`)
}

/**
 * Update manifest.json with tools and description from ALL_TOOLS.
 */
function updateManifest(tools) {
  const manifestPath = join(ROOT, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  manifest.description = `${tools.length} tools for managing Grist documents with AI`

  manifest.tools = tools.map((tool) => ({
    name: tool.name,
    description: tool.purpose
  }))

  manifest.tools_generated = true

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ Updated manifest.json with ${tools.length} tools`)
}

/**
 * Update README.md intro line and tools table.
 */
function updateReadme(tools) {
  const readmePath = join(ROOT, 'README.md')
  let readme = readFileSync(readmePath, 'utf-8')

  // Update intro line (line 7) with tool count
  const introPattern = /^Model Context Protocol server.*$/m
  const newIntro = `Model Context Protocol server with ${tools.length} tools for the Grist API.`
  readme = readme.replace(introPattern, newIntro)

  // Update tools table
  const startMarker = '<!-- TOOLS_TABLE_START -->'
  const endMarker = '<!-- TOOLS_TABLE_END -->'

  const startIdx = readme.indexOf(startMarker)
  const endIdx = readme.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1) {
    console.log('⚠ README.md missing TOOLS_TABLE markers, skipping tools table update')
    writeFileSync(readmePath, readme)
    console.log(`✓ Updated README.md intro line`)
    return
  }

  // Build markdown table
  const header = '| Tool | Purpose |\n|------|---------|'
  const rows = tools.map((tool) => `| \`${tool.name}\` | ${tool.purpose} |`)
  const table = `${startMarker}\n${header}\n${rows.join('\n')}\n${endMarker}`

  const newReadme = readme.slice(0, startIdx) + table + readme.slice(endIdx + endMarker.length)

  writeFileSync(readmePath, newReadme)
  console.log(`✓ Updated README.md intro and tools table with ${tools.length} tools`)
}

/**
 * Validate TOOL_NAMES matches ALL_TOOLS.
 */
async function validateToolNames(tools) {
  const { TOOL_NAMES } = await import(join(ROOT, 'dist/schemas/help.js'))

  const allToolNames = new Set(tools.map((t) => t.name))
  const schemaToolNames = new Set(TOOL_NAMES)

  const missingInSchema = [...allToolNames].filter((n) => !schemaToolNames.has(n))
  const extraInSchema = [...schemaToolNames].filter((n) => !allToolNames.has(n))

  if (missingInSchema.length > 0) {
    console.warn(`⚠ Tools in ALL_TOOLS but not in schemas/help.ts TOOL_NAMES:`)
    missingInSchema.forEach((n) => console.warn(`  - ${n}`))
  }

  if (extraInSchema.length > 0) {
    console.warn(`⚠ Tools in schemas/help.ts TOOL_NAMES but not in ALL_TOOLS:`)
    extraInSchema.forEach((n) => console.warn(`  - ${n}`))
  }

  if (missingInSchema.length === 0 && extraInSchema.length === 0) {
    console.log(`✓ TOOL_NAMES matches ALL_TOOLS (${tools.length} tools)`)
  }
}

async function main() {
  try {
    console.log('Generating from ALL_TOOLS...\n')

    const tools = await loadTools()
    console.log(`Loaded ${tools.length} tools from tool-definitions.js\n`)

    updatePackageDescription(tools)
    updateManifest(tools)
    updateReadme(tools)
    await validateToolNames(tools)

    console.log('\n✓ Generation complete')
  } catch (error) {
    console.error('Generation failed:', error.message)
    process.exit(1)
  }
}

main()
