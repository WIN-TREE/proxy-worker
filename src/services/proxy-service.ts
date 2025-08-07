import type { BackendConfig, ProxyConfig } from '../types';

export class ProxyService {
  constructor(private config: ProxyConfig) {}

  async proxyRequest(request: Request, backend: BackendConfig): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = backend.url + url.pathname + url.search;

    // Prepare headers
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || 'unknown');
    headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || 'unknown');

    // Remove Cloudflare headers
    ['cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry'].forEach(header => {
      headers.delete(header);
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const proxyRequest = new Request(targetUrl, {
          method: request.method,
          headers: headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(proxyRequest, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;

      } catch (error) {
        lastError = error as Error;

        // Only retry on network errors, not HTTP errors
        if (!this.isRetryableError(error as Error)) {
          break;
        }

        if (attempt < this.config.retryAttempts - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private isRetryableError(error: Error): boolean {
    return error.name === 'TypeError' ||
           error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('timeout') ||
           error.message.includes('aborted');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
