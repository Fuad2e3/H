'use strict';

const http = require('http');

/**
 * LoadBalancer coordinates request routing across backend servers.
 * Supports Round-Robin, Least-Connections, and IP-Hash (Sticky Sessions).
 */
class LoadBalancer {
  constructor(backends, options = {}) {
    this.backends = backends;
    this.algorithm = options.algorithm || 'round-robin';
    this.roundRobinIndex = 0;
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.startTime = Date.now();

    // Initialize metrics on each backend
    this.backends.forEach(b => {
      b.activeConnections = 0;
      b.totalHandled = 0;
      b.errorsCount = 0;
      if (b.isHealthy === undefined) b.isHealthy = true;
    });
  }

  getHealthyBackends() {
    const healthy = this.backends.filter(b => b.isHealthy);
    return healthy.length ? healthy : this.backends;
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }

  selectBackend(req) {
    const healthy = this.getHealthyBackends();
    if (!healthy.length) return null;

    if (this.algorithm === 'least-connections') {
      let minBackend = healthy[0];
      for (let i = 1; i < healthy.length; i++) {
        if (healthy[i].activeConnections < minBackend.activeConnections) {
          minBackend = healthy[i];
        }
      }
      return minBackend;
    }

    if (this.algorithm === 'ip-hash') {
      const ip = this.getClientIp(req);
      let hash = 0;
      for (let i = 0; i < ip.length; i++) {
        hash = (hash * 31 + ip.charCodeAt(i)) >>> 0;
      }
      return healthy[hash % healthy.length];
    }

    // Default: Round-Robin
    const backend = healthy[this.roundRobinIndex % healthy.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
    return backend;
  }

  /**
   * Reverse proxies an incoming HTTP request to the selected backend.
   */
  proxyRequest(req, res, retryCount = 0) {
    this.totalRequests++;
    const backend = this.selectBackend(req);

    if (!backend) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
      return res.end(JSON.stringify({
        error: '503 Service Unavailable',
        message: 'No healthy backend servers are currently available in the load balancer pool.',
        timestamp: new Date().toISOString()
      }));
    }

    backend.activeConnections++;
    backend.totalHandled++;

    const clientIp = this.getClientIp(req);
    const isSSE = (req.url || '').indexOf('/api/events') > -1 || (req.headers.accept && req.headers.accept.includes('text/event-stream'));

    const headers = {};
    for (const key of Object.keys(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'connection' || lower === 'keep-alive' || lower === 'upgrade') {
        continue;
      }
      headers[key] = req.headers[key];
    }
    headers['x-forwarded-for'] = req.headers['x-forwarded-for']
      ? `${req.headers['x-forwarded-for']}, ${clientIp}`
      : clientIp;
    headers['x-forwarded-proto'] = 'http';
    headers['x-forwarded-host'] = req.headers.host || '';
    headers['x-balancer-worker'] = backend.id;
    headers.host = `${backend.host}:${backend.port}`;
    headers.connection = isSSE ? 'keep-alive' : 'close';

    const proxyReq = http.request({
      host: backend.host,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: headers,
      timeout: isSSE ? 0 : 30000 // No timeout for long-lived SSE connections
    }, (proxyRes) => {
      // Add Load Balancer tracking headers
      const responseHeaders = Object.assign({}, proxyRes.headers);
      responseHeaders['x-handled-by'] = `${backend.id} (${backend.port})`;

      // Disable response buffering for SSE
      if (isSSE) {
        responseHeaders['cache-control'] = 'no-cache';
        responseHeaders['connection'] = 'keep-alive';
        res.writeHead(proxyRes.statusCode, responseHeaders);
      } else {
        res.writeHead(proxyRes.statusCode, responseHeaders);
      }

      proxyRes.pipe(res);

      proxyRes.on('end', () => {
        backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      });
    });

    proxyReq.on('error', (err) => {
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      backend.errorsCount++;
      this.totalErrors++;

      // If headers not yet sent and we haven't exhausted retries, try another backend
      if (!res.headersSent && retryCount < this.backends.length - 1) {
        console.warn(`⚠️ [Load Balancer] Error contacting ${backend.id} (${err.message}). Retrying on another backend...`);
        backend.isHealthy = false;
        return this.proxyRequest(req, res, retryCount + 1);
      }

      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: '502 Bad Gateway',
          message: `Load Balancer failed to establish connection with worker ${backend.id}.`,
          detail: err.message,
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Handle client disconnects (crucial for SSE and cancelled requests)
    req.on('close', () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

    // Pipe request body or end immediately for GET/HEAD
    if (['GET', 'HEAD'].includes(req.method.toUpperCase())) {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  }

  /**
   * Returns current live snapshot of load balancer statistics.
   */
  getMetrics() {
    const uptimeSec = Math.round((Date.now() - this.startTime) / 1000);
    return {
      status: 'online',
      uptimeSeconds: uptimeSec,
      algorithm: this.algorithm,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      backendsCount: this.backends.length,
      healthyBackendsCount: this.backends.filter(b => b.isHealthy).length,
      backends: this.backends.map(b => ({
        id: b.id,
        host: b.host,
        port: b.port,
        isHealthy: b.isHealthy,
        activeConnections: b.activeConnections,
        totalHandled: b.totalHandled,
        errorsCount: b.errorsCount,
        responseTimeMs: b.responseTimeMs || 0,
        lastCheckTime: b.lastCheckTime
      }))
    };
  }
}

module.exports = LoadBalancer;
