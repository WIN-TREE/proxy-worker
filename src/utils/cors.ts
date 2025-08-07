export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  'Access-Control-Max-Age': '86400'
};

export const addCorsHeaders = (response: Response): Response => {
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });

  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  newResponse.headers.set('X-Proxy-By', 'Cloudflare-Workers');
  return newResponse;
};

export const handleOptionsRequest = (): Response => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
};
