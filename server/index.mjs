import http from 'node:http';
import {normalizeSupplierFeed} from './supplier-feed.mjs';

const port = Number(process.env.PORT || 8787);
const upstream = process.env.FOOD_UPSTREAM_URL || '';
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
const token = process.env.FOOD_API_TOKEN || '';
const maxFeedBytes = 1024 * 1024;
export async function readBoundedJson(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxFeedBytes) throw Error('feed_too_large');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxFeedBytes) throw Error('feed_too_large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const requests = new Map();
const rateLimit = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 60));
function limited(ip) {
  const now = Date.now(), entry = requests.get(ip);
  if (!entry || now - entry.start >= 60000) { requests.set(ip, {start: now, count: 1}); return false; }
  entry.count++;
  return entry.count > rateLimit;
}
setInterval(() => {const now=Date.now();for(const [ip,entry] of requests) if(now-entry.start>60000) requests.delete(ip);},60000).unref();

function send(res, status, body, origin = '') {
  const headers = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'};
  if (allowedOrigin && origin === allowedOrigin) headers['access-control-allow-origin'] = allowedOrigin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'}, origin);
  if (url.pathname === '/api/foods' && limited(req.socket.remoteAddress || 'unknown')) return send(res, 429, {error:'rate_limited',message:'잠시 후 다시 요청하세요.'}, origin);
  if (url.pathname === '/health') return send(res, 200, {ok: true, providerConfigured: Boolean(upstream)}, origin);
  if (url.pathname !== '/api/foods') return send(res, 404, {error: 'not_found'}, origin);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length > 120) return send(res, 400, {error: 'invalid_query'}, origin);
  if (!upstream) return send(res, 503, {error: 'provider_not_configured', message: '상품 공급 API 연결이 필요합니다.'}, origin);
  try {
    const target = new URL(upstream);
    if (target.protocol !== 'https:' || target.username || target.password || !target.hostname) throw new Error('Valid HTTPS upstream required');
    target.searchParams.set('q', q);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(target, {headers: {...(token ? {authorization: 'Bearer ' + token} : {}), accept: 'application/json'}, signal: controller.signal, redirect: 'error'});
    } finally { clearTimeout(timeout); }
    if (!response.ok) return send(res, 502, {error: 'upstream_error'}, origin);
    const data = await readBoundedJson(response);
    if (!data || !Array.isArray(data.products)) return send(res, 502, {error: 'invalid_upstream_schema'}, origin);
    const normalized = normalizeSupplierFeed(data);
    const query = q.toLocaleLowerCase('ko-KR');
    const products = normalized.products.filter(p => p.name.toLocaleLowerCase('ko-KR').includes(query)).slice(0, 100);
    return send(res, 200, {products}, origin);
  } catch {
    return send(res, 502, {error: 'provider_unavailable'}, origin);
  }
});
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) server.listen(port, '0.0.0.0', () => console.log('Food API server listening on ' + port));
