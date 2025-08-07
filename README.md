# Proxy Worker

Multi-region proxy using Cloudflare Workers with intelligent load balancing, health checks, and automatic failover.

## Features

- **Intelligent Load Balancing** - Performance-based backend selection using response time and error rates
- **Geographic Routing** - Automatic routing based on client location (CF-IPCountry)
- **Health Monitoring** - Periodic health checks with circuit breaker pattern
- **Smart Caching** - Content-aware caching for GET requests
- **Automatic Failover** - Multi-tier fallback with retry logic
- **Real-time Metrics** - Built-in monitoring endpoint

## Quick Start

### 1. Configuration

**Method 1: JSON Configuration (Recommended)**

```bash
wrangler secret put BACKENDS_CONFIG
```

Enter JSON configuration:

```json
{
  "backends": [
    {
      "url": "https://api-us.example.com",
      "region": "us-west",
      "weight": 3
    },
    {
      "url": "https://api-asia.example.com",
      "region": "asia-east",
      "weight": 3
    }
  ],
  "retryAttempts": 2,
  "enableCaching": true,
  "cacheMaxAge": 300,
  "healthCheckInterval": 30000,
  "circuitBreakerThreshold": 5
}
```

**Method 2: Environment Variables**

```toml
[vars]
BACKEND_1_URL = "https://api-us.example.com"
BACKEND_1_REGION = "us-west"
BACKEND_1_WEIGHT = "3"
BACKEND_2_URL = "https://api-asia.example.com"
BACKEND_2_REGION = "asia-east"
BACKEND_2_WEIGHT = "3"
```

### 2. Deployment

```bash
# Development
npm run dev

# Production
npm run deploy:prod

# Development environment
npm run deploy:dev
```

## Geographic Routing

Automatic backend selection based on client country:

| Region | Countries | Backend Region |
|--------|-----------|----------------|
| Asia East | CN, HK, TW | `asia-east` |
| Asia Northeast | JP, KR | `asia-northeast` |
| Asia Southeast | SG, MY, TH, ID, PH, VN | `asia-southeast` |
| Americas | US, CA, MX, BR, AR | `us-west`, `americas-*` |
| Europe | GB, DE, FR, NL, IT, ES | `europe-west` |
| Oceania | AU, NZ | `oceania` |

## Monitoring

Access real-time metrics at `/metrics`:

```json
{
  "https://api-us.example.com": {
    "requests": 1250,
    "errors": 3,
    "errorRate": 0.0024,
    "avgResponseTime": 145,
    "isHealthy": true,
    "consecutiveFailures": 0
  }
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `retryAttempts` | 2 | Number of retry attempts for failed requests |
| `enableCaching` | true | Enable response caching for GET requests |
| `cacheMaxAge` | 300 | Cache TTL in seconds |
| `healthCheckInterval` | 30000 | Health check interval in milliseconds |
| `circuitBreakerThreshold` | 5 | Consecutive failures before circuit opens |

## Load Balancing

The proxy uses a multi-tier selection algorithm:

1. **Regional Preference** - Select backends in same geographic region
2. **Performance Weighting** - Factor in response time and error rates
3. **Weighted Random** - Distribute load based on backend weights
4. **Circuit Breaking** - Automatically exclude unhealthy backends

## Error Handling

- **Network Errors** - Automatic retry with exponential backoff
- **Server Errors (5xx)** - Try alternative backends
- **Client Errors (4xx)** - Return immediately without retry
- **Circuit Breaker** - Isolate consistently failing backends

## Development

```bash
# Type check
npm run type-check

# Watch logs
npm run tail

# Local development
npm run dev
```

## Example Routes

```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

## License

MIT
