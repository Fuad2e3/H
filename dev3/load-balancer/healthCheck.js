'use strict';

const http = require('http');

/**
 * HealthChecker monitors backend server availability, response times,
 * and maintains healthy/unhealthy pools for zero-downtime routing.
 */
class HealthChecker {
  constructor(backends, options = {}) {
    this.backends = backends;
    this.path = options.path || '/api/health';
    this.intervalMs = options.intervalMs || 3000;
    this.timeoutMs = options.timeoutMs || 1500;
    this.unhealthyThreshold = options.unhealthyThreshold || 2;
    this.healthyThreshold = options.healthyThreshold || 2;

    this.timer = null;
    this.isRunning = false;

    // Initialize state on each backend
    this.backends.forEach(b => {
      b.isHealthy = b.isHealthy !== undefined ? b.isHealthy : true;
      b.consecutiveSuccesses = 0;
      b.consecutiveFailures = 0;
      b.lastCheckTime = null;
      b.responseTimeMs = 0;
      b.totalChecks = 0;
      b.failedChecks = 0;
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runCheckCycle();
    this.timer = setInterval(() => this.runCheckCycle(), this.intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCheckCycle() {
    const checks = this.backends.map(backend => this.checkBackend(backend));
    await Promise.allSettled(checks);
  }

  checkBackend(backend) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      backend.totalChecks++;

      const req = http.get({
        host: backend.host,
        port: backend.port,
        path: this.path,
        timeout: this.timeoutMs,
        headers: { 'User-Agent': 'Originate-Command-LoadBalancer-HealthCheck/1.0' }
      }, (res) => {
        const responseTime = Date.now() - startTime;
        backend.responseTimeMs = responseTime;
        backend.lastCheckTime = new Date().toISOString();

        // Consume response data to free socket
        res.resume();

        if (res.statusCode >= 200 && res.statusCode < 400) {
          backend.consecutiveSuccesses++;
          backend.consecutiveFailures = 0;

          if (!backend.isHealthy && backend.consecutiveSuccesses >= this.healthyThreshold) {
            backend.isHealthy = true;
            console.log(`💚 [Load Balancer] Backend ${backend.id} (${backend.host}:${backend.port}) RECOVERED -> HEALTHY (${responseTime}ms)`);
          }
          resolve(true);
        } else {
          this.handleFailure(backend, `HTTP ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        this.handleFailure(backend, `Timeout (${this.timeoutMs}ms)`);
        resolve(false);
      });

      req.on('error', (err) => {
        this.handleFailure(backend, err.message);
        resolve(false);
      });
    });
  }

  handleFailure(backend, reason) {
    backend.failedChecks++;
    backend.consecutiveFailures++;
    backend.consecutiveSuccesses = 0;
    backend.lastCheckTime = new Date().toISOString();

    if (backend.isHealthy && backend.consecutiveFailures >= this.unhealthyThreshold) {
      backend.isHealthy = false;
      console.warn(`🔴 [Load Balancer] Backend ${backend.id} (${backend.host}:${backend.port}) DOWN -> UNHEALTHY: ${reason}`);
    }
  }
}

module.exports = HealthChecker;
