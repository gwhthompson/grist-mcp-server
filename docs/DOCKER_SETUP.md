# Docker Setup - Grist MCP Server

**Purpose:** Run a local Grist instance for development and testing

---

## Quick Start

```bash
# 1. Start Docker container
docker compose up -d

# 2. CRITICAL: Wait for post_start initialization
sleep 12

# 3. Set environment variables
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989  # NO /api suffix

# 4. Verify Grist is ready
curl -H "Authorization: Bearer test_api_key" http://localhost:8989/api/orgs
```

---

## Docker Configuration

### compose.yml Structure

```yaml
services:
  grist:
    image: gristlabs/grist:latest
    ports:
      - "8989:8484"  # Host:Container
    environment:
      GRIST_API_KEY: test_api_key
    post_start:  # CRITICAL: Injects API key into database
      - command: |
          node -e "
            const sqlite3 = require('sqlite3');
            const db = new sqlite3.Database('/persist/grist.db');
            db.run(`INSERT OR REPLACE INTO users (id, name, api_key, is_first_login)
                    VALUES (1, 'test', 'test_api_key', 0)`);
            db.close();
          "
    volumes:
      - grist_data:/persist
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8484/"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  grist_data:
```

### Why post_start Hook?

**Problem:** Grist doesn't accept API keys via environment variables alone.

**Solution:** The `post_start` hook:
1. Waits for Grist to fully boot
2. Opens the SQLite database at `/persist/grist.db`
3. Injects the API key into the `users` table
4. Makes the key immediately available for authentication

**Critical:** Without this hook, all API requests will fail with 401 Unauthorized.

---

## Environment Variables

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| **GRIST_API_KEY** | test_api_key | ✅ Yes | Must match the key in compose.yml |
| **GRIST_BASE_URL** | http://localhost:8989 | ✅ Yes | **NO /api suffix** (client adds it) |
| NODE_ENV | test | Optional | Enables test-specific behavior |

### Setting Environment Variables

**Bash/Zsh:**
```bash
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989
```

**Fish:**
```fish
set -x GRIST_API_KEY test_api_key
set -x GRIST_BASE_URL http://localhost:8989
```

**Windows (PowerShell):**
```powershell
$env:GRIST_API_KEY = "test_api_key"
$env:GRIST_BASE_URL = "http://localhost:8989"
```

---

## Docker Commands

### Start Container

```bash
# Start and wait for initialization
docker compose up -d && sleep 12

# Verify container is running
docker ps | grep grist

# Check logs for post_start completion
docker logs <container_id>
```

### Stop Container

```bash
# Stop and preserve data
docker compose stop

# Stop and remove volumes (clean slate)
docker compose down -v
```

### View Logs

```bash
# Follow logs in real-time
docker logs -f <container_id>

# View last 50 lines
docker logs --tail 50 <container_id>
```

### Access Grist UI

```bash
# Open in browser
open http://localhost:8989

# Or visit:
http://localhost:8989
```

---

## Common Issues & Solutions

### Issue 1: Docker Not Ready

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:8989
```

**Cause:** Grist container hasn't finished booting

**Solution:**
```bash
# Wait longer (post_start takes ~10-12 seconds)
sleep 12

# Verify container is healthy
docker ps

# Check logs for "Server ready" message
docker logs <container_id> | grep ready
```

---

### Issue 2: API Key Not Working

**Symptom:**
```
Error: 401 Unauthorized
```

**Cause:** post_start hook didn't complete or failed

**Solution:**
```bash
# Check if post_start executed
docker logs <container_id> | grep "post_start"

# Verify API key in database
docker exec <container_id> sqlite3 /persist/grist.db "SELECT api_key FROM users WHERE id=1"
# Should output: test_api_key

# If not working, restart container
docker compose down -v
docker compose up -d && sleep 12
```

---

### Issue 3: Wrong Base URL

**Symptom:**
```
Error: 404 Not Found
```

**Cause:** Using `/api` suffix in base URL

**Solution:**
```bash
# ❌ WRONG
export GRIST_BASE_URL=http://localhost:8989/api

# ✅ CORRECT
export GRIST_BASE_URL=http://localhost:8989

# The GristClient automatically adds /api to paths
```

---

### Issue 4: Port Already in Use

**Symptom:**
```
Error: Bind for 0.0.0.0:8989 failed: port is already allocated
```

**Cause:** Another process is using port 8989

**Solution:**
```bash
# Find process using port 8989
lsof -i :8989

# Kill the process (use PID from lsof)
kill -9 <PID>

# Or change port in compose.yml
ports:
  - "9000:8484"  # Use port 9000 instead
```

---

### Issue 5: Volume Permission Issues

**Symptom:**
```
Error: EACCES: permission denied, open '/persist/grist.db'
```

**Cause:** Docker volume permissions mismatch

**Solution:**
```bash
# Remove volumes and recreate
docker compose down -v
docker compose up -d && sleep 12

# On Linux, check Docker user permissions
sudo chown -R $USER:$USER ~/.local/share/docker/volumes/
```

---

## Testing Against Docker

### Test Workflow

```bash
# 1. Ensure Docker is running
docker compose up -d && sleep 12

# 2. Set environment
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989

# 3. Build project
npm run build

# 4. Run tests
npm test                    # All 350 tests
npm run test:watch          # Watch mode
npm run test:no-cleanup     # Keep data for inspection
```

### Test Data Cleanup

**Automatic cleanup (default):**
```bash
npm test  # Cleans up test documents after tests
```

**Manual cleanup (for debugging):**
```bash
npm run test:no-cleanup  # Keeps test documents

# Manually delete test data via Grist UI
open http://localhost:8989

# Or clean entire database
docker compose down -v
docker compose up -d && sleep 12
```

---

## Verify Setup

### Health Check Script

```bash
#!/bin/bash

echo "Checking Docker container..."
if ! docker ps | grep -q grist; then
  echo "❌ Grist container not running"
  exit 1
fi
echo "✅ Container running"

echo "Checking API endpoint..."
response=$(curl -s -H "Authorization: Bearer test_api_key" \
  http://localhost:8989/api/orgs)

if [[ $response == *"id"* ]]; then
  echo "✅ API responding"
else
  echo "❌ API not responding"
  echo "Response: $response"
  exit 1
fi

echo "✅ Docker setup verified"
```

### Run Verification

```bash
chmod +x verify-docker.sh
./verify-docker.sh
```

---

## Performance Tuning

### Docker Resource Limits

Edit `compose.yml` to adjust resources:

```yaml
services:
  grist:
    image: gristlabs/grist:latest
    deploy:
      resources:
        limits:
          cpus: '2'      # Limit CPU usage
          memory: 2G     # Limit memory
        reservations:
          cpus: '1'
          memory: 512M
```

### Faster Startup

```bash
# Keep container running between test sessions
docker compose stop  # Instead of `down`

# Restart without full initialization
docker compose start
sleep 3  # Much faster than initial startup
```

---

## Alternative: Production Grist

To test against a production Grist instance instead of Docker:

```bash
# Set environment to your Grist instance
export GRIST_API_KEY=your_actual_api_key
export GRIST_BASE_URL=https://docs.getgrist.com  # Or your self-hosted URL

# Run tests (be careful with production data!)
npm test
```

**Warning:** Only use test workspaces/documents on production instances.

---

## Cleanup

### Remove Everything

```bash
# Stop container and remove volumes
docker compose down -v

# Remove Docker image (optional)
docker rmi gristlabs/grist:latest

# Clear environment variables
unset GRIST_API_KEY
unset GRIST_BASE_URL
```

---

## Summary

**Docker setup checklist:**
- ✅ `docker compose up -d && sleep 12`
- ✅ Set `GRIST_API_KEY=test_api_key`
- ✅ Set `GRIST_BASE_URL=http://localhost:8989` (no /api suffix)
- ✅ Verify with `curl -H "Authorization: Bearer test_api_key" http://localhost:8989/api/orgs`
- ✅ Run `npm test` to validate

**Common pitfalls:**
- ❌ Not waiting 12 seconds after startup
- ❌ Including `/api` in base URL
- ❌ Mismatched API key between compose.yml and environment
- ❌ Forgetting post_start hook in compose.yml

---

*For testing guide: See [TESTING.md](TESTING.md)*
*For development setup: See [DEVELOPMENT.md](DEVELOPMENT.md)*
