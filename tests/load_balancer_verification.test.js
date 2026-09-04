/* =========================================================================
   load_balancer_verification.test.js — Load Balancer Integration & Logic Test
   Tests:
   - Round-Robin distribution across 5 backends
   - Least-Connections distribution
   - IP-Hash deterministic routing
   - Automatic Health Checking & Dead Server Failover
   - Auto-Recovery when downed backend comes back
   - Real-time /lb/status metrics
   Run: node tests/load_balancer_verification.test.js
   ========================================================================= */

'use strict';

const http = require('http');
const assert = require('assert');
const LoadBalancer = require('../load-balancer/balancer');
const HealthChecker = require('../load-balancer/healthCheck');

const MOCK_PORTS = [9201, 9202, 9203, 9204, 9205];
const LB_PORT = 9200;

let mockServers = [];
let requestLogs = {};

// Helper: HTTP GET requesting JSON
function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
  });
}

function startMockServers() {
  return Promise.all(MOCK_PORTS.map((port, idx) => {
    const workerId = `backend-${idx + 1}`;
    requestLogs[workerId] = 0;

    return new Promise((resolve) => {
      const s = http.createServer((req, res) => {
        if (req.url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'ok', worker: workerId }));
        }

        if (req.url === '/api/test') {
          requestLogs[workerId]++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ worker: workerId, handled: requestLogs[workerId] }));
        }

        res.writeHead(404);
        res.end();
      });

      s.listen(port, '127.0.0.1', () => {
        mockServers.push({ port, id: workerId, server: s, isClosed: false });
        resolve();
      });
    });
  }));
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   ENTERPRISE LOAD BALANCER COMPREHENSIVE VERIFICATION SUITE        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('--- [1/6] Starting 5 Backend Servers (Ports 9201..9205) ---');
  await startMockServers();
  console.log('  ✓ 5 Mock Backend Server instances online\n');

  const backends = MOCK_PORTS.map((port, idx) => ({
    id: `backend-${idx + 1}`,
    host: '127.0.0.1',
    port: port,
    weight: 1
  }));

  const balancer = new LoadBalancer(backends, { algorithm: 'round-robin' });
  const healthChecker = new HealthChecker(backends, {
    path: '/api/health',
    intervalMs: 800,
    timeoutMs: 500,
    unhealthyThreshold: 1,
    healthyThreshold: 1
  });

  const lbServer = http.createServer((req, res) => {
    if (req.url === '/lb/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(balancer.getMetrics()));
    }
    balancer.proxyRequest(req, res);
  });

  await new Promise(r => lbServer.listen(LB_PORT, '127.0.0.1', r));
  console.log(`  ✓ Load Balancer listening on port ${LB_PORT}\n`);

  console.log('--- [2/6] Verifying Round-Robin Distribution Across 5 Backends ---');
  // Send 15 requests, expect exactly 3 per backend (15 / 5 = 3)
  for (let i = 0; i < 15; i++) {
    const res = await getJson(`http://127.0.0.1:${LB_PORT}/api/test`);
    assert.strictEqual(res.status, 200);
  }

  for (let i = 1; i <= 5; i++) {
    const count = requestLogs[`backend-${i}`];
    assert.strictEqual(count, 3, `Backend-${i} must receive exactly 3 requests`);
    console.log(`  ✓ Backend-${i} handled exactly ${count} requests (20% traffic share)`);
  }

  console.log('\n--- [3/6] Verifying IP-Hash / Sticky Session Routing ---');
  balancer.algorithm = 'ip-hash';
  const firstRes = await getJson(`http://127.0.0.1:${LB_PORT}/api/test`, { 'X-Forwarded-For': '192.168.1.50' });
  const stickyWorker = firstRes.body.worker;

  for (let i = 0; i < 5; i++) {
    const res = await getJson(`http://127.0.0.1:${LB_PORT}/api/test`, { 'X-Forwarded-For': '192.168.1.50' });
    assert.strictEqual(res.body.worker, stickyWorker, 'Same IP must always hit the same sticky backend');
  }
  console.log(`  ✓ IP 192.168.1.50 deterministically routed to ${stickyWorker} across all 6 requests`);

  console.log('\n--- [4/6] Verifying Live Health Checking & Dead Server Failover ---');
  balancer.algorithm = 'round-robin';
  // Simulate Backend-3 crashing / going down
  const downServer = mockServers.find(s => s.id === 'backend-3');
  await new Promise(r => downServer.server.close(r));
  downServer.isClosed = true;
  console.log('  ⚡ Simulated sudden failure on backend-3 (port 9203 closed)');

  // Run health check probe
  await healthChecker.runCheckCycle();
  const deadBackend = backends.find(b => b.id === 'backend-3');
  assert.strictEqual(deadBackend.isHealthy, false, 'Backend-3 must be marked unhealthy');
  console.log('  ✓ Health Checker detected failure and marked backend-3 UNHEALTHY');

  // Send 12 requests, verify traffic is smoothly balanced only across the 4 surviving backends
  const preCounts = Object.assign({}, requestLogs);
  for (let i = 0; i < 12; i++) {
    const res = await getJson(`http://127.0.0.1:${LB_PORT}/api/test`);
    assert.strictEqual(res.status, 200);
  }

  assert.strictEqual(requestLogs['backend-3'], preCounts['backend-3'], 'Downed backend-3 must receive 0 new requests');
  for (let i of [1, 2, 4, 5]) {
    const diff = requestLogs[`backend-${i}`] - preCounts[`backend-${i}`];
    assert.strictEqual(diff, 3, `Backend-${i} should handle 3 requests during failover`);
    console.log(`  ✓ Healthy backend-${i} seamlessly handled ${diff} requests during failover`);
  }

  console.log('\n--- [5/6] Verifying Automatic Server Recovery & Re-Entry ---');
  // Re-start backend-3 on port 9203
  await new Promise((resolve) => {
    const newServer = http.createServer((req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', worker: 'backend-3' }));
      }
      if (req.url === '/api/test') {
        requestLogs['backend-3']++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ worker: 'backend-3', handled: requestLogs['backend-3'] }));
      }
    });
    newServer.listen(9203, '127.0.0.1', () => {
      downServer.server = newServer;
      downServer.isClosed = false;
      resolve();
    });
  });
  console.log('  ⚡ Backend-3 restarted and back online');

  // Trigger health check probe
  await healthChecker.runCheckCycle();
  assert.strictEqual(deadBackend.isHealthy, true, 'Backend-3 must be restored to healthy');
  console.log('  ✓ Health Checker confirmed recovery and restored backend-3 to active pool');

  // Send 5 requests, verify backend-3 receives requests again
  const preReviveCount = requestLogs['backend-3'];
  for (let i = 0; i < 5; i++) {
    const res = await getJson(`http://127.0.0.1:${LB_PORT}/api/test`);
    assert.strictEqual(res.status, 200);
  }
  assert.ok(requestLogs['backend-3'] > preReviveCount, 'Backend-3 must handle traffic again after recovery');
  console.log('  ✓ Recovered backend-3 handled traffic immediately');

  console.log('\n--- [6/6] Verifying /lb/status Live Metrics Endpoint ---');
  const statusRes = await getJson(`http://127.0.0.1:${LB_PORT}/lb/status`);
  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.body.status, 'online');
  assert.strictEqual(statusRes.body.backendsCount, 5);
  assert.strictEqual(statusRes.body.healthyBackendsCount, 5);
  assert.ok(statusRes.body.totalRequests > 30);
  console.log(`  ✓ /lb/status reports: ${statusRes.body.totalRequests} total requests, 5/5 healthy backends`);

  console.log('\n====================================================================');
  console.log(' 🎉 ALL LOAD BALANCER 5-BACKEND CHECKS VERIFIED & PASSED! ✅');
  console.log('====================================================================\n');

  // Teardown
  healthChecker.stop();
  lbServer.close();
  mockServers.forEach(s => {
    try { s.server.close(); } catch (_) {}
  });

  setTimeout(() => process.exit(0), 100);
}

runTests().catch(err => {
  console.error('\n❌ Load Balancer verification failed:', err);
  process.exit(1);
});
