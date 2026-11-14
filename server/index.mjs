import http from 'node:http';
import {normalizeSupplierFeed} from './supplier-feed.mjs';

const port = Number(process.env.PORT || 8787);
const upstream = process.env.FOOD_UPSTREAM_URL || '';
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
const token = process.env.FOOD_API_TOKEN || '';

function send(res, status, body, origin = '') {
  const headers = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'};
  if (allowedOrigin && origin === allowedOrigin) headers['access-control-allow-origin'] = allowedOrigin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/health') return send(res, 200, {ok: true, providerConfigured: Boolean(upstream)}, origin);
  if (url.pathname !== '/api/foods') return send(res, 404, {error: 'not_found'}, origin);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length > 120) return send(res, 400, {error: 'invalid_query'}, origin);
  if (!upstream) return send(res, 503, {error: 'provider_not_configured', message: '상품 공급 API 연결이 필요합니다.'}, origin);
  try {
    const target = new URL(upstream);
    if (target.protocol !== 'https:') throw new Error('HTTPS upstream required');
    target.searchParams.set('q', q);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(target, {headers: {...(token ? {authorization: 'Bearer ' + token} : {}), accept: 'application/json'}, signal: controller.signal});
    } finally { clearTimeout(timeout); }
    if (!response.ok) return send(res, 502, {error: 'upstream_error'}, origin);
    const data = await response.json();
    if (!data || !Array.isArray(data.products)) return send(res, 502, {error: 'invalid_upstream_schema'}, origin);
    const normalized = normalizeSupplierFeed(data);
    const query = q.toLocaleLowerCase('ko-KR');
    const products = normalized.products.filter(p => p.name.toLocaleLowerCase('ko-KR').includes(query)).slice(0, 100);
    return send(res, 200, {products}, origin);
  } catch {
    return send(res, 502, {error: 'provider_unavailable'}, origin);
  }
}).listen(port, '0.0.0.0', () => console.log('Food API server listening on ' + port));
