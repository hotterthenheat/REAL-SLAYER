/**
 * Lightweight observability primitives for the Express server.
 *
 * This keeps request IDs and structured HTTP logs out of route code while the
 * production telemetry backend (Sentry/OpenTelemetry/metrics) is wired in.
 */
import crypto from 'node:crypto';
import type express from 'express';

export function requestContextMiddleware(): express.RequestHandler {
  return (req, res, next) => {
    const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
    (req as any).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

export function structuredHttpLogger(): express.RequestHandler {
  return (req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      console.log(JSON.stringify({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'http_request',
        request_id: (req as any).requestId || res.getHeader('x-request-id'),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - started,
        ip: req.ip,
        user_agent: req.headers['user-agent'] || '',
      }));
    });
    next();
  };
}
