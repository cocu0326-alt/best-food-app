import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {server} from './index.mjs';

// Exercise the real HTTP handler without external services or paid API keys.
async function withServer(run){
 server.listen(0,'127.0.0.1');
 try{
  await once(server,'listening');
  const address=server.address();
  await run('http://127.0.0.1:'+address.port);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}

test('health endpoint exposes provider readiness without pretending data is available',async()=>{
 await withServer(async base=>{
  const response=await fetch(base+'/health');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(typeof data.providerConfigured,'boolean');
  assert.equal(typeof data.csvReady,'boolean');
  assert.equal(response.headers.get('cache-control'),'no-store');
 });
});

test('API rejects missing, duplicated, and extra search parameters',async()=>{
 await withServer(async base=>{
  for(const query of ['', '?q=', '?q=우유&q=사과', '?q=우유&debug=1']){
   const response=await fetch(base+'/api/foods'+query);
   assert.equal(response.status,400,query);
   assert.equal((await response.json()).error,'invalid_query');
  }
 });
});

test('API does not invent product prices when no supplier is configured',async()=>{
 await withServer(async base=>{
  const response=await fetch(base+'/api/foods?q='+encodeURIComponent('우유'));
  const body=await response.json();
  assert.ok([200,503].includes(response.status));
  if(response.status===503)assert.equal(body.error,'provider_not_configured');
  else assert.ok(Array.isArray(body.products));
 });
});

test('unknown route and unsupported method are rejected',async()=>{
 await withServer(async base=>{
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/health',{method:'POST'})).status,405);
 });
});


test('demo CSV fixture supports Korean product search and price comparison',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {parseConsumerPriceCsv}=await import('./consumer-price-csv.mjs');
 const csv=await readFile(new URL('../samples/demo-consumer-prices.csv',import.meta.url),'utf8');
 const results=parseConsumerPriceCsv(csv,'저지방 우유');
 assert.equal(results.length,2);
 assert.deepEqual(results.map(x=>x.price),[2900,3200]);
 assert.ok(results.every(x=>x.seller.startsWith('예시마트')));
});


test('real HTTP API serves the sample CSV without paid API credentials',async()=>{
 const {spawn}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const {resolve}=await import('node:path');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const folder=await mkdtemp(resolve(tmpdir(),'best-food-http-'));
 const {copyFile}=await import('node:fs/promises');
 const csvPath=resolve(folder,'demo.csv');
 await copyFile(fileURLToPath(new URL('../samples/demo-consumer-prices.csv',import.meta.url)),csvPath);
 const net=await import('node:net');
 const probe=net.createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[fileURLToPath(new URL('./index.mjs',import.meta.url))],{
  env:{...process.env,PORT:String(port),FOOD_UPSTREAM_URL:'',NAVER_CLIENT_ID:'',NAVER_CLIENT_SECRET:'',CONSUMER_PRICE_CSV_PATH:csvPath},
  stdio:['ignore','pipe','pipe']
 });
 try{
  let response;
  for(let attempt=0;attempt<35;attempt++){
   if(child.exitCode!==null)throw Error('sample server exited before readiness');
   try{response=await fetch(base+'/health',{signal:AbortSignal.timeout(500)});if(response.ok)break}catch{}
   await new Promise(done=>setTimeout(done,100));
  }
  assert.ok(response?.ok,'sample server did not become ready');
  const ready=await response.json();
  assert.equal(ready.csvReady,true);
  const result=await fetch(base+'/api/foods?q='+encodeURIComponent('저지방 우유'));
  assert.equal(result.status,200);
  const body=await result.json();
  assert.deepEqual(body.products,[]);
  assert.deepEqual(body.candidates.map(item=>item.price),[2900,3200]);
  assert.ok(body.notice.includes('실시간 판매가격이 아닙니다'));
 }finally{
  child.kill();
  await new Promise(done=>{if(child.exitCode!==null||child.signalCode!==null)return done();child.once('exit',done);});
  await rm(folder,{recursive:true,force:true});
 }
});

test('public CSV downloader accepts valid survey CSV, caches it and rejects HTML portals',async()=>{
 const {loadRemoteConsumerSurveyCsv}=await import('./index.mjs');
 const {readFile}=await import('node:fs/promises');
 const csv=await readFile(new URL('../samples/demo-consumer-prices.csv',import.meta.url),'utf8');
 const url='https://www.data.go.kr/download/consumer-test.csv';
 let calls=0;
 const fakeFetch=async()=>{calls++;return new Response(csv,{headers:{'content-type':'text/csv'}})};
 assert.equal(await loadRemoteConsumerSurveyCsv(url,fakeFetch,1000),csv);
 assert.equal(await loadRemoteConsumerSurveyCsv(url,fakeFetch,2000),csv);
 assert.equal(calls,1,'repeated requests must use the six-hour cache');
 await assert.rejects(loadRemoteConsumerSurveyCsv('https://untrusted.example/download.csv',fakeFetch),/invalid_consumer_csv_url/);
 await assert.rejects(loadRemoteConsumerSurveyCsv('https://www.data.go.kr/download/portal.html',async()=>new Response('<html>not CSV</html>',{headers:{'content-type':'text/html'}}),30000000),/consumer_csv_not_download/);
});

test('public CSV downloader rejects oversized streaming responses without a Content-Length header',async()=>{
 const {loadRemoteConsumerSurveyCsv}=await import('./index.mjs');
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(80_000_001));controller.close()}});
 await assert.rejects(loadRemoteConsumerSurveyCsv('https://www.data.go.kr/download/oversized.csv',async()=>new Response(stream,{headers:{'content-type':'text/csv'}}),30000001),/invalid_consumer_csv/);
});

test('public CSV downloader refuses header-only feeds with no actual surveyed prices',async()=>{
 const {loadRemoteConsumerSurveyCsv}=await import('./index.mjs');
 const csv='상품명,조사일,판매가격,판매업소\n';
 const fakeFetch=async()=>new Response(csv,{headers:{'content-type':'text/csv'}});
 await assert.rejects(loadRemoteConsumerSurveyCsv('https://www.data.go.kr/download/header-only.csv',fakeFetch,40000000),/consumer_csv_no_valid_prices/);
});

test('official public report supplies actual historical dumpling prices without API keys',async()=>{
 const {searchPublishedSurveyPrices,reportDate}=await import('./published-survey.mjs');
 const results=searchPublishedSurveyPrices('만두');
 assert.equal(reportDate,'2026-08-28');
 assert.equal(results.length,3);
 assert.ok(results.some(x=>x.name.includes('고향만두')&&x.price===7980));
 assert.ok(results.some(x=>x.name.includes('고기만두')&&x.minPrice===7480&&x.maxPrice===10490));
 assert.ok(results.every(x=>x.surveyDate===reportDate&&x.seller.includes('개별 판매처 미제공')));
 assert.deepEqual(searchPublishedSurveyPrices('존재하지않는상품'),[]);
});
