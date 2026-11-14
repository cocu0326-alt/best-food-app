import http from 'node:http';

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
    const products = data.products.slice(0, 100).filter(p => p && typeof p.name === 'string' && Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.size) && p.size > 0 && ['g','mL'].includes(p.measure) && Number.isFinite(p.rating) && p.rating >= 0 && p.rating <= 5 && Number.isInteger(p.reviews) && p.reviews >= 0).map(p => ({name: p.name, price: p.price, size: p.size, measure: p.measure, rating: p.rating, reviews: p.reviews, seller: String(p.seller || ''), url: typeof p.url === 'string' && /^https:\/\//.test(p.url) ? p.url : ''}));
    return send(res, 200, {products}, origin);
  } catch {
    return send(res, 502, {error: 'provider_unavailable'}, origin);
  }
}).listen(port, '0.0.0.0', () => console.log('Food API server listening on ' + port));
