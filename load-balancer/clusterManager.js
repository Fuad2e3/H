'use strict';

const path = require('path');
const { fork } = require('child_process');

/**
 * ClusterManager spawns and supervises multiple backend server worker processes.
 * Supports 5 backends (or any configurable number) with auto-respawn on crash.
 */
class ClusterManager {
  constructor(options = {}) {
    this.workersCount = options.workersCount || 5;
    this.startPort = options.startPort || 7001;
    const fs = require('fs');
    const localApi = path.join(__dirname, '..', 'API', 'app.js');
    const dev3Api = path.join(__dirname, '..', 'dev3', 'API', 'app.js');
    this.apiScript = options.apiScript || (fs.existsSync(dev3Api) ? dev3Api : localApi);
    this.workers = new Map(); // port -> { process, port, id, restarts }
    this.isShuttingDown = false;
  }

  startAll() {
    console.log(`\n🚀 [Cluster Manager] Spawning ${this.workersCount} backend server worker instances...`);
    for (let i = 0; i < this.workersCount; i++) {
      const port = this.startPort + i;
      const workerId = `backend-${i + 1}`;
      this.spawnWorker(workerId, port);
    }
  }

  spawnWorker(id, port) {
    if (this.isShuttingDown) return;

    const child = fork(this.apiScript, [], {
      env: Object.assign({}, process.env, {
        PORT: String(port),
        WORKER_ID: id,
        IS_BALANCER_WORKER: 'true'
      }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    const info = {
      id,
      port,
      process: child,
      pid: child.pid,
      startTime: Date.now(),
      restarts: (this.workers.get(port) ? this.workers.get(port).restarts : 0)
    };

    this.workers.set(port, info);

    child.stdout.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg.includes('Enterprise Manual Server') || msg.includes('═══')) return;
      if (msg.length > 0) {
        // Output worker log if needed
      }
    });

    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg.length > 0) {
        console.warn(`⚠️ [${id}:${port} ERR] ${msg}`);
      }
    });

    child.on('exit', (code, signal) => {
      if (this.isShuttingDown) return;
      info.restarts++;
      console.warn(`⚠️ [Cluster Manager] Worker ${id} (Port ${port}, PID ${child.pid}) exited (code: ${code}, signal: ${signal}). Auto-restarting in 1s...`);
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.spawnWorker(id, port);
        }
      }, 1000);
    });

    console.log(`  ✓ Spawned ${id} on port ${port} (PID: ${child.pid})`);
  }

  stopAll() {
    this.isShuttingDown = true;
    console.log('\n🛑 [Cluster Manager] Gracefully stopping all backend workers...');
    for (const [port, worker] of this.workers.entries()) {
      try {
        if (worker.process && !worker.process.killed) {
          worker.process.kill('SIGTERM');
        }
      } catch (_) {}
    }
    this.workers.clear();
  }

  getWorkersList() {
    const list = [];
    for (const [port, w] of this.workers.entries()) {
      list.push({
        id: w.id,
        port: w.port,
        pid: w.pid,
        restarts: w.restarts,
        uptimeSeconds: Math.round((Date.now() - w.startTime) / 1000)
      });
    }
    return list;
  }
}

module.exports = ClusterManager;
