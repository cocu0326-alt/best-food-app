// Best Food API bridge. Node.js 20+; no dependencies.
// Configure FOOD_PROVIDER_URL to an authorized HTTPS endpoint returning {products:[...]}.
// Optional FOOD_PROVIDER_TOKEN is sent only to that endpoint as a Bearer token.
const http = require('node:http');
const {URL} = require('node:url');
const port = Number(process.env.PORT || 8080);
const providerUrl = process.env.FOOD_PROVIDER_URL || '';
const token = process.env.FOOD_PROVIDER_TOKEN || '';
const origin = process.env.APP_ORIGIN || '*';
function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {'content-type':'application/json; charset=utf-8',
    'access-control-allow-origin':origin, 'access-control-allow-methods':'GET, OPTIONS',
    'access-control-allow-headers':'Content-Type', 'cache-control':'no-store'});
  res.end(data);
}
function configured() {
  try { const u = new URL(providerUrl); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.hash; }
  catch { return false; }
}
http.createServer(async (req,res) => {
  if(req.method === 'OPTIONS') return json(res,204,{});
  if(req.method !== 'GET') return json(res,405,{error:'Method not allowed'});
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { return json(res,400,{error:'Invalid request'}); }
  if(url.pathname === '/health') return json(res,200,{ok:true,providerConfigured:configured()});
  if(url.pathname !== '/api/foods') return json(res,404,{error:'Not found'});
  const q = (url.searchParams.get('q') || '').trim();
  if(!q || q.length > 120) return json(res,400,{error:'Query must be 1-120 characters'});
  if(!configured()) return json(res,503,{error:'Authorized product provider is not configured'});
  const upstream = new URL(providerUrl);
  upstream.searchParams.set('q',q);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),10000);
  try {
    const headers = {accept:'application/json'};
    if(token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(upstream,{headers,signal:controller.signal,redirect:'error'});
    if(!response.ok) return json(res,502,{error:'Product provider request failed'});
    if(!(response.headers.get('content-type') || '').includes('application/json')) return json(res,502,{error:'Provider response is not JSON'});
    const length = Number(response.headers.get('content-length'));
    if(Number.isFinite(length) && length > 2000000) return json(res,502,{error:'Provider response too large'});
    const reader = response.body.getReader();
    const chunks=[]; let size=0;
    while(true) {
      const {done,value} = await reader.read();
      if(done) break;
      size += value.byteLength;
      if(size > 2000000) { await reader.cancel(); return json(res,502,{error:'Provider response too large'}); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks.map(v=>Buffer.from(v))).toString('utf8'));
    if(!data || !Array.isArray(data.products)) return json(res,502,{error:'Provider products array missing'});
    const products = data.products.slice(0,100).filter(p=>p && typeof p === 'object' && !Array.isArray(p));
    return json(res,200,{products});
  } catch {
    return json(res,502,{error:'Product provider unavailable or timed out'});
  } finally { clearTimeout(timer); }
}).listen(port, '0.0.0.0', () => console.log('Best Food bridge listening on '+port));
