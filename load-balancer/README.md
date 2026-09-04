# Originate Command — Enterprise Load Balancer

A production-grade, zero-dependency Node.js Reverse Proxy Load Balancer designed for high availability, zero-downtime failover, and high-throughput traffic distribution across **5 backend server instances** (or any configurable number).

---

## Key Features

1. **5 Backend Workers (Configurable to 2..N)**:
   - Spawns and manages 5 internal backend instances running on sequential ports (`7001`, `7002`, `7003`, `7004`, `7005`).
   - Automatically restarts any crashed worker process with auto-recovery protection.
2. **Three Load Balancing Algorithms**:
   - **Round Robin**: Circular, equal traffic distribution across all active backends.
   - **Least Connections**: Dynamically routes new requests to the backend server with the lowest active in-flight connection count.
   - **IP Hash (Sticky Sessions)**: Hashed client IP mapping so a specific user consistently hits the same backend worker.
3. **Continuous Health Probing & Auto-Failover**:
   - Probes `/api/health` every 3 seconds.
   - If a backend crashes or hangs, it is immediately marked `UNHEALTHY` and traffic is diverted to the surviving backends without user disruption.
   - When a downed server comes back online, it is automatically restored to the active pool.
4. **SSE (Server-Sent Events) & Large Upload Streaming**:
   - Streaming HTTP reverse proxy without memory buffering.
   - Preserves `Connection: keep-alive` and `Cache-Control: no-cache` for real-time live events (`/api/events`).
5. **Real-time Metrics Dashboard**:
   - Status & Metrics: `http://localhost:7000/lb/status`
   - Health Endpoint: `http://localhost:7000/lb/health`

---

## Quick Start

### Command Line
```bash
cd load-balancer
node server.js
```

### Custom Port, Workers, or Algorithm
```bash
# Run on port 8000 with 5 backend workers
node server.js --port 8000 --workers 5 --algo round-robin

# Run with least-connections algorithm
node server.js --algo least-connections
```

---

## Configuration (`config.json`)

```json
{
  "port": 7000,
  "host": "0.0.0.0",
  "algorithm": "round-robin",
  "autoSpawnWorkers": true,
  "workersCount": 5,
  "startWorkerPort": 7001,
  "healthCheck": {
    "enabled": true,
    "path": "/api/health",
    "intervalMs": 3000,
    "timeoutMs": 1500,
    "unhealthyThreshold": 2,
    "healthyThreshold": 2
  }
}
```
