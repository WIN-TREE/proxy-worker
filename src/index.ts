import type { Env } from './types';
import { ProxyHandler } from './handlers/proxy-handler';
import { addCorsHeaders, handleOptionsRequest } from './utils/cors';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return handleOptionsRequest();
    }

    // Handle metrics endpoint
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Only expose metrics in development environment
    if (url.pathname === '/metrics' && env.ENVIRONMENT === 'development') {
      try {
        const proxyHandler = new ProxyHandler(env);
        const metrics = proxyHandler.getMetrics();

        return addCorsHeaders(new Response(JSON.stringify(metrics, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        }));
      } catch (error) {
        return addCorsHeaders(new Response(JSON.stringify({
          error: 'Failed to retrieve metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Handle proxy requests
    try {
      const proxyHandler = new ProxyHandler(env);
      const response = await proxyHandler.handleRequest(request);
      return addCorsHeaders(response);

    } catch (error) {
      console.error('Proxy handler error:', error);
      return addCorsHeaders(new Response(JSON.stringify({
        error: 'Proxy configuration error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  }
};
