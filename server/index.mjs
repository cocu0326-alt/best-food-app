import http from 'node:http';
import {normalizeSupplierFeed} from './supplier-feed.mjs';

const port = Number(process.env.PORT || 8787);
const upstream = process.env.FOOD_UPSTREAM_URL || '';
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
if (allowedOrigin) {
  let parsedOrigin;
  try { parsedOrigin = new URL(allowedOrigin); } catch { throw Error('ALLOWED_ORIGIN must be an HTTPS origin'); }
  if (parsedOrigin.protocol !== 'https:' || !parsedOrigin.hostname || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.origin !== allowedOrigin) {
    throw Error('ALLOWED_ORIGIN must be an HTTPS origin without path, query, or credentials');
  }
}
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
export async function fetchSupplierJson(target, authToken = '', timeoutMs = 8000, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target, {
      headers: {...(authToken ? {authorization: 'Bearer ' + authToken} : {}), accept: 'application/json'},
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) { await response.body?.cancel().catch(() => {}); return {ok: false}; }
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) { await response.body?.cancel().catch(() => {}); return {ok: false}; }
    return {ok: true, data: await readBoundedJson(response)};
  } finally {
    clearTimeout(timeout);
  }
}
export function searchSupplierProducts(data, q) {
  if (!data || !Array.isArray(data.products)) throw new Error('invalid_upstream_schema');
  const normalized = normalizeSupplierFeed(data);
  const normalizeSearchText = value => value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ko-KR');
  const query = normalizeSearchText(q);
  const seen = new Set();
  const exactNameMatches = [];
  const nameMatches = [];
  const sellerMatches = [];
  for (const product of normalized.products) {
    const nameMatch = normalizeSearchText(product.name).includes(query);
    const sellerMatch = normalizeSearchText(product.seller).includes(query);
    if (!nameMatch && !sellerMatch) continue;
    const key = JSON.stringify([
      normalizeSearchText(product.name),
      normalizeSearchText(product.seller),
      product.price, product.size, product.measure
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    (normalizeSearchText(product.name) === query ? exactNameMatches : nameMatch ? nameMatches : sellerMatches).push(product);
  }
  const results = exactNameMatches.concat(nameMatches, sellerMatches).slice(0,100);
  return results;
}
const requests = new Map();
const configuredLimit = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);
if (!Number.isSafeInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 100000) throw Error('RATE_LIMIT_PER_MINUTE must be an integer from 1 to 100000');
const rateLimit = configuredLimit;
if (upstream) {
  const parsed = new URL(upstream);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname) throw Error('FOOD_UPSTREAM_URL must be a valid HTTPS URL without credentials');
}
function limited(ip) {
  const now = Date.now(), entry = requests.get(ip);
  if (!entry || now - entry.start >= 60000) { requests.set(ip, {start: now, count: 1}); return false; }
  entry.count++;
  return entry.count > rateLimit;
}
setInterval(() => {const now=Date.now();for(const [ip,entry] of requests) if(now-entry.start>60000) requests.delete(ip);},60000).unref();

function send(res, status, body, origin = '') {
  const headers = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'};
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
  const queryValues = url.searchParams.getAll('q');
  if (queryValues.length !== 1 || [...url.searchParams.keys()].some(key => key !== 'q')) return send(res, 400, {error: 'invalid_query'}, origin);
  const q = queryValues[0].trim();
  if (!q || q.length > 120) return send(res, 400, {error: 'invalid_query'}, origin);
  if (!upstream) return send(res, 503, {error: 'provider_not_configured', message: '상품 공급 API 연결이 필요합니다.'}, origin);
  try {
    const target = new URL(upstream);
    if (target.protocol !== 'https:' || target.username || target.password || target.hash || !target.hostname) throw new Error('Valid HTTPS upstream required');
    target.searchParams.set('q', q);
    const result = await fetchSupplierJson(target, token);
    if (!result.ok) return send(res, 502, {error: 'upstream_error'}, origin);
    const data = result.data;
    if (!data || !Array.isArray(data.products)) return send(res, 502, {error: 'invalid_upstream_schema'}, origin);
    return send(res, 200, {products: searchSupplierProducts(data, q)}, origin);
  } catch {
    return send(res, 502, {error: 'provider_unavailable'}, origin);
  }
});
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) server.listen(port, '0.0.0.0', () => console.log('Food API server listening on ' + port));
