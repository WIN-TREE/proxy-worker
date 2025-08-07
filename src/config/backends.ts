import type { ProxyConfig, BackendConfig, Env } from '../types';

const DEFAULT_CONFIG: ProxyConfig = {
  backends: [
    {
      url: 'https://httpbin.org',
      weight: 1,
      region: 'global',
    }
  ],
  retryAttempts: 2,
  enableCaching: true,
  cacheMaxAge: 300,
  healthCheckInterval: 30000,
  circuitBreakerThreshold: 5,
};

export class ConfigLoader {
  static loadConfig(env: Env): ProxyConfig {
    try {
      if (env.BACKENDS_CONFIG) {
        return this.loadFromJSON(env.BACKENDS_CONFIG, env);
      }

      const backends = this.loadFromEnvVariables(env);
      if (backends.length > 0) {
        return this.buildConfigFromBackends(backends, env);
      }

      console.warn('No backend configuration found, using default fallback');
      return DEFAULT_CONFIG;

    } catch (error) {
      console.error('Config loading error:', error);
      console.warn('Falling back to default configuration');
      return DEFAULT_CONFIG;
    }
  }

  private static loadFromJSON(configJson: string, env: Env): ProxyConfig {
    const config = JSON.parse(configJson) as Partial<ProxyConfig>;

    if (!config.backends || config.backends.length === 0) {
      throw new Error('No backends defined in BACKENDS_CONFIG');
    }

    return {
      backends: config.backends,
      retryAttempts: config.retryAttempts || this.parseNumber(env.RETRY_ATTEMPTS, 2),
      enableCaching: config.enableCaching ?? this.parseBoolean(env.ENABLE_CACHING, true),
      cacheMaxAge: config.cacheMaxAge || this.parseNumber(env.CACHE_MAX_AGE, 300),
      healthCheckInterval: config.healthCheckInterval || this.parseNumber(env.HEALTH_CHECK_INTERVAL, 30000),
      circuitBreakerThreshold: config.circuitBreakerThreshold || this.parseNumber(env.CIRCUIT_BREAKER_THRESHOLD, 5),
    };
  }

  private static loadFromEnvVariables(env: Env): BackendConfig[] {
    const backends: BackendConfig[] = [];

    for (let i = 1; i <= 5; i++) {
      const url = env[`BACKEND_${i}_URL` as keyof Env] as string;

      if (url) {
        const region = env[`BACKEND_${i}_REGION` as keyof Env] as string || 'unknown';
        const weight = this.parseNumber(env[`BACKEND_${i}_WEIGHT` as keyof Env] as string, 1);

        backends.push({
          url: url.trim(),
          region: region.trim(),
          weight,
        });
      }
    }

    return backends;
  }

  private static buildConfigFromBackends(backends: BackendConfig[], env: Env): ProxyConfig {
    return {
      backends,
      retryAttempts: this.parseNumber(env.RETRY_ATTEMPTS, 2),
      enableCaching: this.parseBoolean(env.ENABLE_CACHING, true),
      cacheMaxAge: this.parseNumber(env.CACHE_MAX_AGE, 300),
      healthCheckInterval: this.parseNumber(env.HEALTH_CHECK_INTERVAL, 30000),
      circuitBreakerThreshold: this.parseNumber(env.CIRCUIT_BREAKER_THRESHOLD, 5),
    };
  }

  private static parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private static parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  static validateConfig(config: ProxyConfig): void {
    if (!config.backends || config.backends.length === 0) {
      throw new Error('At least one backend must be configured');
    }

    for (const backend of config.backends) {
      if (!backend.url) {
        throw new Error('Backend URL is required');
      }
      if (!backend.region) {
        throw new Error('Backend region is required');
      }
      if (backend.weight <= 0) {
        throw new Error('Backend weight must be greater than 0');
      }
    }
  }
}
