export const createErrorResponse = (message: string, status: number): Response => {
  return new Response(JSON.stringify({
    error: message,
    status: status,
    timestamp: new Date().toISOString()
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const generateRequestId = (): string => {
  return Math.random().toString(36).substring(2, 15);
};

export const isNetworkError = (error: Error): boolean => {
  return error.name === 'TypeError' ||
         error.message.includes('fetch') ||
         error.message.includes('network') ||
         error.message.includes('timeout');
};

export const getErrorStatus = (error: Error): number => {
  if (error.message.includes('timeout')) return 504;
  if (error.message.includes('network')) return 502;
  if (error.message.includes('aborted')) return 499;
  return 503;
};
