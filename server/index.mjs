import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {parseConsumerPriceCsv} from './consumer-price-csv.mjs';
import {normalizeSupplierFeed} from './supplier-feed.mjs';

const port = Number(process.env.PORT || 8787);
const upstream = process.env.FOOD_UPSTREAM_URL || '';
const consumerPriceCsvPath = process.env.CONSUMER_PRICE_CSV_PATH || '';
// Cache source bytes while the CSV file's size and modification time are unchanged.
// Avoid reading up to 80 MB from disk on every product search.
let surveyFileCache = null;
export async function loadConsumerSurveyCsv(path, statImpl=stat, readImpl=readFile) {
  const file=await statImpl(path);
  if(!file.isFile()||file.size<=0||file.size>80_000_000)throw Error('invalid_consumer_csv');
  const signature=String(file.size)+':'+String(file.mtimeMs);
  if(surveyFileCache&&surveyFileCache.path===path&&surveyFileCache.signature===signature)return surveyFileCache.text;
  const bytes=await readImpl(path);
  if(bytes.length>80_000_000)throw Error('invalid_consumer_csv');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
  catch{text=new TextDecoder('euc-kr',{fatal:true}).decode(bytes)}
  surveyFileCache={path,signature,text};
  return text;
}
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
// Android WebView file:// pages send Origin: null for cross-origin fetches.
// Explicit opt-in only: null is also used by sandboxed and local-file pages.
const allowAndroidFileOrigin = process.env.ALLOW_ANDROID_FILE_ORIGIN === 'true';
if (allowedOrigin) {
  let parsedOrigin;
  try { parsedOrigin = new URL(allowedOrigin); } catch { throw Error('ALLOWED_ORIGIN must be an HTTPS origin'); }
  if (parsedOrigin.protocol !== 'https:' || !parsedOrigin.hostname || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.origin !== allowedOrigin) {
    throw Error('ALLOWED_ORIGIN must be an HTTPS origin without path, query, or credentials');
  }
}
const token = process.env.FOOD_API_TOKEN || '';
const naverClientId = process.env.NAVER_CLIENT_ID || '';
const naverClientSecret = process.env.NAVER_CLIENT_SECRET || '';
if (Boolean(naverClientId) !== Boolean(naverClientSecret)) throw Error('NAVER_CLIENT_ID and NAVER_CLIENT_SECRET must be configured together');
export function cleanNaverTitle(value) {
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value||'').replace(/<[^>]*>/g,' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,entity=>entities[entity.slice(1,-1).toLowerCase()]||' ')
    .replace(/\s+/g,' ').trim().slice(0,200);
}
export function normalizeNaverItems(data) {
  if (!data || !Array.isArray(data.items)) throw Error('invalid_naver_schema');
  return data.items.slice(0,100).flatMap(item => {
    const name=cleanNaverTitle(item.title);
    const price=Number(item.lprice);
    let url='';
    try {const u=new URL(item.link);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href} catch {}
    if(!name||!Number.isSafeInteger(price)||price<=0||!url)return [];
    return [{name,price,url,seller:typeof item.mallName==='string'?item.mallName.slice(0,120):'',source:'네이버쇼핑 검색',size:null,measure:null,rating:null,reviews:null}];
  });
}

// Keep only matching shopping candidates and remove duplicate listings.
// Prices are search listings, not verified checkout prices.
export function filterNaverCandidates(items, query, limit=30) {
  const terms=String(query).normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length||!Number.isSafeInteger(limit)||limit<0)return [];
  const normalize=value=>String(value||'').normalize('NFC').toLowerCase().replace(/\s+/g,'');
  const seen=new Set(),matches=[];
  for(const item of items){
    const name=normalize(item.name);
    if(!terms.every(term=>name.includes(normalize(term))))continue;
    const key=JSON.stringify([name,normalize(item.seller),item.price,item.url]);
    if(seen.has(key))continue;
    seen.add(key);
    matches.push(item);
  }
  matches.sort((a,b)=>a.price-b.price||a.name.localeCompare(b.name,'ko'));
  return matches.slice(0,limit);
}

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
  const normalizeSearchText = value => value.normalize('NFC').replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().toLocaleLowerCase('ko-KR');
  const query = normalizeSearchText(q);
  if (!query) return [];
  const seen = new Set();
  const exactNameMatches = [];
  const startsWithNameMatches = [];
  const nameMatches = [];
  const sellerMatches = [];
  const nameTokenMatches = [];
  const tokenMatches = [];
  const tokens = [...new Set(query.split(' ').filter(Boolean))];
  const matchesToken = (text, token) => text.split(' ').some(word => word.includes(token));
  for (const product of normalized.products) {
    const nameText = normalizeSearchText(product.name);
    const sellerText = normalizeSearchText(product.seller);
    const nameMatch = nameText.includes(query);
    const sellerMatch = sellerText.includes(query);
    const nameTokenMatch = query.includes(' ') && tokens.every(token => matchesToken(nameText, token));
    const tokenMatch = query.includes(' ') && tokens.every(token => matchesToken(nameText, token) || matchesToken(sellerText, token));
    if (!nameMatch && !sellerMatch && !nameTokenMatch && !tokenMatch) continue;
    const key = JSON.stringify([
      normalizeSearchText(product.name),
      normalizeSearchText(product.seller),
      product.price, product.size, product.measure,
      product.url ? (() => { const link = new URL(product.url); link.hash = ''; return link.href; })() : ''
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    (nameText === query ? exactNameMatches : nameText.startsWith(query) ? startsWithNameMatches : nameMatch ? nameMatches : nameTokenMatch ? nameTokenMatches : sellerMatch ? sellerMatches : tokenMatches).push(product);
  }
  const results = exactNameMatches.concat(startsWithNameMatches, nameMatches, nameTokenMatches, sellerMatches, tokenMatches).slice(0,100);
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
  if (!entry || now - entry.start >= 60000) { if(!entry && requests.size>=10000){for(const [key,value] of requests){if(now-value.start>=60000)requests.delete(key)}if(requests.size>=10000)return true}requests.set(ip, {start: now, count: 1}); return false; }
  entry.count++;
  return entry.count > rateLimit;
}
setInterval(() => {const now=Date.now();for(const [ip,entry] of requests) if(now-entry.start>60000) requests.delete(ip);},60000).unref();

function send(res, status, body, origin = '') {
  const headers = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'};
  if (allowedOrigin && origin === allowedOrigin) headers['access-control-allow-origin'] = allowedOrigin;
  else if (allowAndroidFileOrigin && origin === 'null') headers['access-control-allow-origin'] = 'null';
  if (headers['access-control-allow-origin']) headers['vary'] = 'Origin';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return send(res, 400, {error:'invalid_request_url'}, origin); }
  if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'}, origin);
  if (url.pathname === '/api/foods' && limited(req.socket.remoteAddress || 'unknown')) return send(res, 429, {error:'rate_limited',message:'잠시 후 다시 요청하세요.'}, origin);
  if (url.pathname === '/health') {
    let csvReady=false;
    if (consumerPriceCsvPath) {
      try { const file=await stat(consumerPriceCsvPath);csvReady=file.isFile()&&file.size>0&&file.size<=80_000_000; } catch {}
    }
    return send(res,200,{ok:true,providerConfigured:Boolean(upstream||csvReady||(naverClientId&&naverClientSecret)),csvReady},origin);
  }
  if (url.pathname !== '/api/foods') return send(res, 404, {error: 'not_found'}, origin);
  const queryValues = url.searchParams.getAll('q');
  if (queryValues.length !== 1 || [...url.searchParams.keys()].some(key => key !== 'q')) return send(res, 400, {error: 'invalid_query'}, origin);
  const q = queryValues[0].trim();
  if (!q || q.length > 120 || !q.replace(/[\s\u00a0\u200b\ufeff]+/gu, '') || /[\u0000-\u001f\u007f]/u.test(q)) return send(res, 400, {error: 'invalid_query'}, origin);
  if (!upstream && consumerPriceCsvPath) {
    try {
      const csv=await loadConsumerSurveyCsv(consumerPriceCsvPath);
      return send(res,200,{products:[],candidates:parseConsumerPriceCsv(csv,q),notice:'한국소비자원 조사 가격이며 실시간 판매가격이 아닙니다.'},origin);
    } catch (error) {return send(res,502,{error:error?.message==='missing_required_columns'?'consumer_csv_invalid_columns':'consumer_csv_unavailable'},origin);}
  }
  if (!upstream && naverClientId && naverClientSecret) {
    try {
      const target=new URL('https://openapi.naver.com/v1/search/shop.json');
      target.searchParams.set('query',q);
      target.searchParams.set('display','30');
      const response=await fetch(target,{headers:{'X-Naver-Client-Id':naverClientId,'X-Naver-Client-Secret':naverClientSecret,accept:'application/json'},signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok)return send(res,502,{error:'naver_upstream_error'},origin);
      if(!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')||''))return send(res,502,{error:'naver_invalid_content_type'},origin);
      const data=await readBoundedJson(response);
      return send(res,200,{products:[],candidates:filterNaverCandidates(normalizeNaverItems(data),q),notice:'네이버쇼핑 검색 결과입니다. 용량·평점·리뷰 정보가 제공되지 않아 종합평가에 자동 등록하지 않습니다.'},origin);
    } catch {return send(res,502,{error:'naver_provider_unavailable'},origin);}
  }
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
