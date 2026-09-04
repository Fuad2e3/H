/* =========================================================================
   server.js — Originate Command Enterprise Load Balancer
   High-Performance Node.js Reverse Proxy with:
   - Multiple backend worker orchestration (Default 5 workers)
   - Continuous background health-checking with auto-failover
   - Algorithms: Round-Robin, Least-Connections, IP-Hash (Sticky Sessions)
   - Native unbuffered streaming for Server-Sent Events (SSE) & file uploads
   - Real-time metrics & status dashboard at /lb/status
   ========================================================================= */

'use strict';

const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const LoadBalancer = require('./balancer');
const HealthChecker = require('./healthCheck');
const ClusterManager = require('./clusterManager');

// 1. Load Configuration
const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.warn('⚠️ [Load Balancer] Could not read config.json, using defaults.');
}

// CLI argument parsing (e.g., --port 8000, --workers 5, --algorithm round-robin)
const args = process.argv.slice(2);
function getArg(key, fallback) {
  const idx = args.indexOf(key);
  if (idx > -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const PORT = parseInt(process.env.LB_PORT || getArg('--port', config.port || 7000), 10);
const HOST = process.env.LB_HOST || getArg('--host', config.host || '0.0.0.0');
const WORKERS_COUNT = parseInt(process.env.WORKERS_COUNT || getArg('--workers', config.workersCount || 5), 10);
const START_PORT = parseInt(process.env.START_PORT || getArg('--start-port', config.startWorkerPort || 7001), 10);
const ALGORITHM = process.env.LB_ALGORITHM || getArg('--algo', config.algorithm || 'round-robin');
const AUTO_SPAWN = process.env.AUTO_SPAWN !== 'false' && (config.autoSpawnWorkers !== false) && !args.includes('--no-spawn');

// 2. Build Backends Pool
let backends = [];
if (config.backends && Array.isArray(config.backends) && config.backends.length === WORKERS_COUNT) {
  backends = config.backends;
} else {
  // Dynamically generate backends based on WORKERS_COUNT
  for (let i = 0; i < WORKERS_COUNT; i++) {
    const port = START_PORT + i;
    backends.push({
      id: `backend-${i + 1}`,
      host: '127.0.0.1',
      port: port,
      weight: 1
    });
  }
}

// 3. Initialize Core Subsystems
const balancer = new LoadBalancer(backends, { algorithm: ALGORITHM });
const healthChecker = new HealthChecker(backends, config.healthCheck || {});

let clusterManager = null;
if (AUTO_SPAWN) {
  clusterManager = new ClusterManager({
    workersCount: WORKERS_COUNT,
    startPort: START_PORT
  });
}

// 4. Create Load Balancer HTTP Server
const server = http.createServer((req, res) => {
  // Handle Load Balancer internal status and health endpoints
  if (req.url === '/lb/status' || req.url === '/lb/status/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    const metrics = balancer.getMetrics();
    if (clusterManager) {
      metrics.workerProcesses = clusterManager.getWorkersList();
    }
    return res.end(JSON.stringify(metrics, null, 2));
  }

  if (req.url === '/lb/health' || req.url === '/lb/health/') {
    const healthyCount = balancer.getHealthyBackends().length;
    const isHealthy = healthyCount > 0;
    res.writeHead(isHealthy ? 200 : 503, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({
      status: isHealthy ? 'healthy' : 'degraded',
      healthyWorkers: healthyCount,
      totalWorkers: backends.length,
      timestamp: new Date().toISOString()
    }));
  }

  // Proxy all other application and API traffic to balanced backend workers
  balancer.proxyRequest(req, res);
});

// Helper: Network Local IP
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// 5. Start Server
server.listen(PORT, HOST, () => {
  const localIP = getLocalIp();
  const bar = '═'.repeat(66);

  console.log('\n╔' + bar + '╗');
  console.log('║        ORIGINATE COMMAND — HIGH-AVAILABILITY LOAD BALANCER       ║');
  console.log('╠' + bar + '╣');
  console.log(`║  Load Balancer URL →  http://localhost:${PORT}/`.padEnd(67) + '║');
  console.log(`║  Network Address   →  http://${localIP}:${PORT}/`.padEnd(67) + '║');
  console.log(`║  Status & Metrics  →  http://localhost:${PORT}/lb/status`.padEnd(67) + '║');
  console.log(`║  Health Endpoint   →  http://localhost:${PORT}/lb/health`.padEnd(67) + '║');
  console.log('╠' + bar + '╣');
  console.log(`║  Algorithm         →  ${ALGORITHM.toUpperCase()}`.padEnd(67) + '║');
  console.log(`║  Backend Workers   →  ${WORKERS_COUNT} Active Instances (${START_PORT}..${START_PORT + WORKERS_COUNT - 1})`.padEnd(67) + '║');
  console.log(`║  SSE Stream Sync   →  Supported (Direct Live Streaming)`.padEnd(67) + '║');
  console.log(`║  Health Probe      →  Every ${config.healthCheck ? config.healthCheck.intervalMs / 1000 : 3}s (Auto-Failover Active)`.padEnd(67) + '║');
  console.log('╚' + bar + '╝\n');

  // Spawn backend workers if auto-spawn enabled
  if (clusterManager) {
    clusterManager.startAll();
  }

  // Start background health checking
  healthChecker.start();
});

// 6. Graceful Shutdown
function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down Load Balancer cleanly...`);
  healthChecker.stop();
  if (clusterManager) {
    clusterManager.stopAll();
  }
  server.close(() => {
    console.log('✓ Load Balancer server closed. Goodbye.');
    process.exit(0);
  });

  // Force exit after 3s if still hanging
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { server, balancer, healthChecker, clusterManager };
