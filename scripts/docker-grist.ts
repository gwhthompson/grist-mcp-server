#!/usr/bin/env tsx
/**
 * Grist Docker Management CLI
 *
 * Usage:
 *   npm run grist start              - Start container with ephemeral port
 *   npm run grist stop               - Stop container
 *   npm run grist status             - Show container status
 *   npm run grist inspect            - GUI inspector (default)
 *   npm run grist inspect dev        - GUI inspector with tsx (hot reload)
 *   npm run grist inspect cli -- ... - CLI inspector (pass MCP inspector args after --)
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { devContainer } from './grist-docker.js'

const execFileAsync = promisify(execFile)

// Parse command line arguments
const args = process.argv.slice(2)
const command = args[0]

// Find -- separator for extra args
const dashDashIndex = args.indexOf('--')
const extraArgs = dashDashIndex >= 0 ? args.slice(dashDashIndex + 1) : []
const mainArgs = dashDashIndex >= 0 ? args.slice(0, dashDashIndex) : args

/**
 * Run MCP inspector with the given mode and extra args.
 */
async function runInspector(
  mode: string | undefined,
  inspectorExtraArgs: string[]
): Promise<void> {
  // Ensure container is running
  const { url, apiKey } = await devContainer.start()

  // Build if not in dev mode
  if (mode !== 'dev') {
    console.log('\nBuilding...')
    await execFileAsync('npm', ['run', 'build'])
  }

  // Determine the server command
  const serverCmd = mode === 'dev' ? ['tsx', 'src/index.ts'] : ['node', 'dist/index.js']

  // Build inspector command
  const inspectorArgs = ['@modelcontextprotocol/inspector']

  // Add --cli flag if cli mode
  if (mode === 'cli') {
    inspectorArgs.push('--cli')
  }

  // Add the server command
  inspectorArgs.push(...serverCmd)

  // Add any extra args passed after --
  if (inspectorExtraArgs.length > 0) {
    inspectorArgs.push(...inspectorExtraArgs)
  }

  console.log(`\nStarting MCP Inspector (${mode || 'gui'} mode)...`)

  // Run inspector with environment variables
  const inspector = spawn('npx', inspectorArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      GRIST_BASE_URL: url,
      GRIST_API_KEY: apiKey
    }
  })

  // Handle cleanup on exit
  const cleanup = () => {
    inspector.kill()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  inspector.on('close', (code) => {
    process.exit(code ?? 0)
  })
}

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'start': {
        const { url, apiKey } = await devContainer.start()
        console.log('\n✓ Grist ready!')
        console.log(`  URL: ${url}`)
        console.log(`  API Key: ${apiKey}`)
        console.log('\nTo use in your shell:')
        console.log(`  export GRIST_BASE_URL=${url}`)
        console.log(`  export GRIST_API_KEY=${apiKey}`)
        break
      }

      case 'stop':
        await devContainer.stop()
        console.log('✓ Container stopped')
        break

      case 'status': {
        const status = await devContainer.getStatus()
        if (status.running && status.url) {
          console.log('✓ Grist is running')
          console.log(`  URL: ${status.url}`)
          try {
            const apiKey = await devContainer.bootstrapApiKey(status.url)
            console.log(`  API Key: ${apiKey}`)
          } catch {
            console.log('  API Key: (unable to retrieve)')
          }
        } else {
          console.log('✗ Grist is not running')
          console.log('  Run: npm run grist start')
        }
        break
      }

      case 'inspect': {
        // Check for mode: dev or cli
        const mode = mainArgs[1]
        if (mode && !['dev', 'cli'].includes(mode)) {
          console.error(`Unknown inspect mode: ${mode}`)
          console.error('Usage: npm run grist inspect [dev|cli] [inspector-args]')
          process.exit(1)
        }
        // Args after mode go to inspector
        const inspectorExtraArgs =
          extraArgs.length > 0 ? extraArgs : mainArgs.slice(2)
        await runInspector(mode, inspectorExtraArgs)
        break
      }

      default:
        console.log(`Grist Docker Management

Usage:
  npm run grist start              Start container with ephemeral port
  npm run grist stop               Stop container
  npm run grist status             Show container status

Inspector:
  npm run grist inspect            GUI inspector (default)
  npm run grist inspect dev        GUI inspector with tsx (hot reload)
  npm run grist inspect cli        CLI inspector
  npm run grist inspect cli -- --method tools/list
                                   CLI inspector with MCP args
Note: The -- before inspector args is optional`)
        break
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
