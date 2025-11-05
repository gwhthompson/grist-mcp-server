/**
 * Docker Management for Tests
 *
 * Handles starting, stopping, and checking Docker Grist instance
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DockerConfig {
  url: string;
  apiKey: string;
  composeFile?: string;
  startupTimeout?: number;
  healthCheckInterval?: number;
}

export const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  url: process.env.GRIST_URL || 'http://localhost:8989',
  apiKey: process.env.GRIST_API_KEY || 'test_api_key',
  composeFile: './compose.yml',
  startupTimeout: 30000,
  healthCheckInterval: 1000
};

/**
 * Check if Docker is installed and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker Compose is running
 */
export async function isComposeRunning(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker compose -f ${config.composeFile} ps --services --filter "status=running"`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Start Docker Compose
 */
export async function startCompose(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<void> {
  console.log('Starting Docker Compose...');
  await execAsync(`docker compose -f ${config.composeFile} up -d`);
  console.log('Docker Compose started');
}

/**
 * Stop Docker Compose
 */
export async function stopCompose(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<void> {
  console.log('Stopping Docker Compose...');
  await execAsync(`docker compose -f ${config.composeFile} down`);
  console.log('Docker Compose stopped');
}

/**
 * Wait for Grist to be ready
 */
export async function waitForGrist(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<boolean> {
  const startTime = Date.now();
  const timeout = config.startupTimeout || 30000;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${config.url}/api/orgs`, {
        headers: { Authorization: `Bearer ${config.apiKey}` }
      });

      if (response.ok) {
        console.log('Grist is ready!');
        return true;
      }
    } catch {
      // Grist not ready yet
    }

    await sleep(config.healthCheckInterval || 1000);
  }

  throw new Error(`Grist did not become ready within ${timeout}ms`);
}

/**
 * Ensure Docker Compose is running and Grist is ready
 */
export async function ensureGristReady(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<void> {
  if (!(await isDockerAvailable())) {
    throw new Error('Docker is not installed or not running');
  }

  if (!(await isComposeRunning(config))) {
    await startCompose(config);
  }

  await waitForGrist(config);
}

/**
 * Helper to sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get Docker Compose logs
 */
export async function getComposeLogs(
  service?: string,
  config: DockerConfig = DEFAULT_DOCKER_CONFIG
): Promise<string> {
  try {
    const cmd = service
      ? `docker compose -f ${config.composeFile} logs ${service}`
      : `docker compose -f ${config.composeFile} logs`;
    const { stdout } = await execAsync(cmd);
    return stdout;
  } catch (error) {
    return `Failed to get logs: ${error}`;
  }
}

/**
 * Reset Grist database (stop and remove volumes)
 */
export async function resetGrist(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<void> {
  console.log('Resetting Grist database...');
  await execAsync(`docker compose -f ${config.composeFile} down -v`);
  await startCompose(config);
  await waitForGrist(config);
  console.log('Grist reset complete');
}
