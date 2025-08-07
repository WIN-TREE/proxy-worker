import type { Env, RequestInfo, BackendConfig, BackendHealth, BackendMetrics } from '../types';
import { ConfigLoader } from '../config/backends';
import { LoadBalancer } from '../services/load-balancer';
import { ProxyService } from '../services/proxy-service';
import { createErrorResponse, generateRequestId, isNetworkError, getErrorStatus } from '../utils/helpers';

export class ProxyHandler {
  private loadBalancer: LoadBalancer;
  private proxyService: ProxyService;
  private cache: Cache;
  private config: any;
  private healthStatus = new Map<string, BackendHealth>();
  private metrics = new Map<string, BackendMetrics>();

  constructor(env: Env) {
    this.config = ConfigLoader.loadConfig(env);
    ConfigLoader.validateConfig(this.config);

    this.loadBalancer = new LoadBalancer();
    this.proxyService = new ProxyService(this.config);
    this.cache = caches.default;

    // Initialize backend health status
    this.config.backends.forEach((backend: BackendConfig) => {
      this.healthStatus.set(backend.url, {
        isHealthy: true,
        lastCheck: 0,
        consecutiveFailures: 0,
        avgResponseTime: 0
      });
      this.metrics.set(backend.url, {
        requests: 0,
        errors: 0,
        totalTime: 0
      });
    });
  }

  async handleRequest(request: Request): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      const requestInfo = this.parseRequest(request);

      // Request size check
      if (await this.isRequestTooLarge(request)) {
        return createErrorResponse('Request too large', 413);
      }

      // Try cache for GET requests
      if (this.config.enableCaching && request.method === 'GET') {
        const cachedResponse = await this.getCachedResponse(request);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      // Get healthy backends
      const healthyBackends = await this.getHealthyBackends();
      if (healthyBackends.length === 0) {
        return createErrorResponse('All backends unavailable', 503);
      }

      // Proxy request with fallback
      const response = await this.proxyRequestWithFallback(request, requestId, healthyBackends);

      // Update metrics
      const backendUrl = response.headers.get('X-Backend-URL') || '';
      const duration = Date.now() - startTime;
      this.updateMetrics(backendUrl, duration, response.ok);

      // Cache successful responses
      if (this.shouldCacheResponse(request, response)) {
        await this.cacheResponse(request, response);
      }

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${requestId}] Request failed after ${duration}ms:`, error);

      return createErrorResponse(
        'Service temporarily unavailable',
        getErrorStatus(error as Error)
      );
    }
  }

  private async proxyRequestWithFallback(
    request: Request,
    requestId: string,
    backends: BackendConfig[]
  ): Promise<Response> {
    let lastError: Error | null = null;
    const requestInfo = this.parseRequest(request);

    // Try up to 3 different backends
    for (let i = 0; i < Math.min(backends.length, 3); i++) {
      const backend = this.loadBalancer.selectBackend(backends, requestInfo, this.metrics);

      try {
        const response = await this.proxyService.proxyRequest(request, backend);

        if (response.ok) {
          this.markBackendHealthy(backend.url);

          // Create new response with modifiable headers
          const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers)
          });

          // Add backend info to response headers
          newResponse.headers.set('X-Backend-URL', backend.url);
          newResponse.headers.set('X-Backend-Region', backend.region);

          return newResponse;
        } else if (response.status >= 500) {
          // Server error, try next backend
          this.markBackendUnhealthy(backend.url);
          lastError = new Error(`Backend returned ${response.status}`);
          continue;
        } else {
          // Client error, return directly but still add headers
          const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers)
          });

          newResponse.headers.set('X-Backend-URL', backend.url);
          newResponse.headers.set('X-Backend-Region', backend.region);

          return newResponse;
        }
      } catch (error) {
        lastError = error as Error;
        this.markBackendUnhealthy(backend.url);

        // If network error and more backends available, continue
        if (isNetworkError(error as Error) && i < Math.min(backends.length, 3) - 1) {
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('All backends failed');
  }

  private async getHealthyBackends(): Promise<BackendConfig[]> {
    const now = Date.now();

    // Periodic health checks
    for (const backend of this.config.backends) {
      const health = this.healthStatus.get(backend.url);
      if (health && now - health.lastCheck > this.config.healthCheckInterval) {
        await this.checkBackendHealth(backend);
      }
    }

    return this.config.backends.filter((backend: BackendConfig) => {
      const health = this.healthStatus.get(backend.url);
      return health?.isHealthy !== false;
    });
  }

  private async checkBackendHealth(backend: BackendConfig): Promise<void> {
    const health = this.healthStatus.get(backend.url);
    if (!health) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${backend.url}/health`, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        health.isHealthy = true;
        health.consecutiveFailures = 0;
      } else {
        health.consecutiveFailures++;
        health.isHealthy = health.consecutiveFailures < this.config.circuitBreakerThreshold;
      }
    } catch (error) {
      health.consecutiveFailures++;
      health.isHealthy = health.consecutiveFailures < this.config.circuitBreakerThreshold;
    }

    health.lastCheck = Date.now();
    this.healthStatus.set(backend.url, health);
  }

  private markBackendHealthy(url: string): void {
    const health = this.healthStatus.get(url);
    if (health) {
      health.isHealthy = true;
      health.consecutiveFailures = 0;
    }
  }

  private markBackendUnhealthy(url: string): void {
    const health = this.healthStatus.get(url);
    if (health) {
      health.consecutiveFailures++;
      health.isHealthy = health.consecutiveFailures < this.config.circuitBreakerThreshold;
    }
  }

  private updateMetrics(backendUrl: string, duration: number, success: boolean): void {
    const metrics = this.metrics.get(backendUrl);
    if (metrics) {
      metrics.requests++;
      metrics.totalTime += duration;
      if (!success) {
        metrics.errors++;
      }
    }

    const health = this.healthStatus.get(backendUrl);
    if (health) {
      health.avgResponseTime = (health.avgResponseTime + duration) / 2;
    }
  }

  private async getCachedResponse(request: Request): Promise<Response | null> {
    try {
      return (await this.cache.match(request)) || null;
    } catch (error) {
      return null;
    }
  }

  private shouldCacheResponse(request: Request, response: Response): boolean {
    if (!this.config.enableCaching || request.method !== 'GET' || !response.ok) {
      return false;
    }

    const cacheControl = response.headers.get('cache-control');
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('private')) {
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ||
           contentType.includes('text/') ||
           contentType.includes('application/xml');
  }

  private async cacheResponse(request: Request, response: Response): Promise<void> {
    try {
      const responseToCache = response.clone();
      responseToCache.headers.set('Cache-Control', `max-age=${this.config.cacheMaxAge}`);
      responseToCache.headers.set('X-Cached-At', new Date().toISOString());

      await this.cache.put(request, responseToCache);
    } catch (error) {
      // Ignore cache errors
    }
  }

  private async isRequestTooLarge(request: Request): Promise<boolean> {
    const contentLength = request.headers.get('content-length');
    return contentLength ? parseInt(contentLength) > 10 * 1024 * 1024 : false; // 10MB
  }

  private parseRequest(request: Request): RequestInfo {
    const url = new URL(request.url);
    return {
      method: request.method,
      path: url.pathname + url.search,
      clientIP: request.headers.get('CF-Connecting-IP') || 'unknown',
      country: request.headers.get('CF-IPCountry') || 'unknown',
      userAgent: request.headers.get('User-Agent') || 'unknown'
    };
  }

  // Get runtime metrics for monitoring
  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [url, metrics] of this.metrics.entries()) {
      const health = this.healthStatus.get(url);
      result[url] = {
        requests: metrics.requests,
        errors: metrics.errors,
        errorRate: metrics.requests > 0 ? metrics.errors / metrics.requests : 0,
        avgResponseTime: metrics.requests > 0 ? metrics.totalTime / metrics.requests : 0,
        isHealthy: health?.isHealthy ?? false,
        consecutiveFailures: health?.consecutiveFailures ?? 0
      };
    }

    return result;
  }
}
