export interface Env {
  ENVIRONMENT: string;
  BACKENDS_CONFIG?: string;
  BACKEND_1_URL?: string;
  BACKEND_1_REGION?: string;
  BACKEND_1_WEIGHT?: string;
  BACKEND_2_URL?: string;
  BACKEND_2_REGION?: string;
  BACKEND_2_WEIGHT?: string;
  BACKEND_3_URL?: string;
  BACKEND_3_REGION?: string;
  BACKEND_3_WEIGHT?: string;
  BACKEND_4_URL?: string;
  BACKEND_4_REGION?: string;
  BACKEND_4_WEIGHT?: string;
  BACKEND_5_URL?: string;
  BACKEND_5_REGION?: string;
  BACKEND_5_WEIGHT?: string;
  RETRY_ATTEMPTS?: string;
  ENABLE_CACHING?: string;
  CACHE_MAX_AGE?: string;
  HEALTH_CHECK_INTERVAL?: string;
  CIRCUIT_BREAKER_THRESHOLD?: string;
}

export interface BackendConfig {
  url: string;
  weight: number;
  region: string;
}

export interface ProxyConfig {
  backends: BackendConfig[];
  retryAttempts: number;
  enableCaching: boolean;
  cacheMaxAge: number;
  healthCheckInterval: number;
  circuitBreakerThreshold: number;
}

export interface RequestInfo {
  method: string;
  path: string;
  clientIP: string;
  country: string;
  userAgent: string;
}

export interface BackendHealth {
  isHealthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  avgResponseTime: number;
}

export interface BackendMetrics {
  requests: number;
  errors: number;
  totalTime: number;
}
