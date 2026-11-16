import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function freePort() {
  const server=net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

test('health, method rejection, rate limiting and missing supplier',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    env:{...process.env,PORT:String(port),RATE_LIMIT_PER_MINUTE:'4',FOOD_UPSTREAM_URL:''},
    stdio:'ignore'
  });
  t.after(()=>child.kill());
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null) throw Error('server exited before ready');
    try {const response=await fetch(base+'/health');if(response.ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready,'server must start');
  const health=await (await fetch(base+'/health')).json();
  assert.deepEqual(health,{ok:true,providerConfigured:false,csvReady:false});
  assert.equal((await fetch(base+'/api/foods?q=rice',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/api/foods?q=rice&q=apple')).status,400,'duplicate search parameters must be rejected');
  assert.equal((await fetch(base+'/api/foods?q=rice&token=secret')).status,400,'unsupported query parameters must be rejected');
  assert.equal((await fetch(base+'/api/foods?q=rice')).status,503);
  assert.equal((await fetch(base+'/api/foods?q=rice')).status,503);
  const limited=await fetch(base+'/api/foods?q=rice');
  assert.equal(limited.status,429);
  assert.equal((await limited.json()).error,'rate_limited');
  assert.equal((await fetch(base+'/health')).status,200,'health remains available');
});

test('rejects invalid startup environment settings',async()=>{
  for(const env of [
    {FOOD_UPSTREAM_URL:'https://user:pass@example.com/foods'},
    {FOOD_UPSTREAM_URL:'http://example.com/foods'},
    {FOOD_UPSTREAM_URL:'https://example.com/foods#secret'},
    {RATE_LIMIT_PER_MINUTE:'not-a-number'},
    {RATE_LIMIT_PER_MINUTE:'0'},
    {ALLOWED_ORIGIN:'http://example.com'},
    {ALLOWED_ORIGIN:'https://example.com/path'},
    {ALLOWED_ORIGIN:'https://example.com?token=x'},
    {ALLOWED_ORIGIN:'https://user:pass@example.com'},
    {ALLOWED_ORIGIN:'*'}
  ]){
    const child=spawn(process.execPath,['server/index.mjs'],{
      env:{...process.env,PORT:'0',FOOD_UPSTREAM_URL:'',RATE_LIMIT_PER_MINUTE:'60',...env},
      stdio:'ignore'
    });
    const [code]=await once(child,'exit');
    assert.notEqual(code,0,'invalid config must prevent startup: '+JSON.stringify(env));
  }
});

test('rejects oversized supplier feed response without importing data',async t=>{
  const upstreamPort=await freePort();
  const http=(await import('node:http')).default;
  const upstream=http.createServer((req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({products:[{name:'X'.repeat(1100000)}]}));
  });
  await new Promise(resolve=>upstream.listen(upstreamPort,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>upstream.close(resolve)));
  // The server requires HTTPS upstreams; test bounded parsing directly via exported helper.
  const {readBoundedJson}=await import('./index.mjs');
  assert.equal(typeof readBoundedJson,'function');
  const response=await fetch('http://127.0.0.1:'+upstreamPort);
  await assert.rejects(()=>readBoundedJson(response),/feed_too_large/);
});

test('rejects oversized content-length before reading body',async()=>{
  const {readBoundedJson}=await import('./index.mjs');
  const response=new Response('small body',{headers:{'content-length':'1048577'}});
  await assert.rejects(()=>readBoundedJson(response),/feed_too_large/);
});

test('handles invalid supplier JSON and invalid response schema',async()=>{
  const {readBoundedJson}=await import('./index.mjs');
  await assert.rejects(()=>readBoundedJson(new Response('{invalid',{headers:{'content-type':'application/json'}})),SyntaxError);
  const parsed=await readBoundedJson(new Response(JSON.stringify({items:[]}),{headers:{'content-type':'application/json'}}));
  assert.equal(Array.isArray(parsed.products),false);
});

test('parses valid supplier JSON below size limit',async()=>{
  const {readBoundedJson}=await import('./index.mjs');
  const input={products:[{name:'국산 사과',price:3000,size:500,measure:'g'}]};
  const parsed=await readBoundedJson(new Response(JSON.stringify(input)));
  assert.deepEqual(parsed,input);
});

test('returns no-store and browser-safe headers for API responses',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    env:{...process.env,PORT:String(port),FOOD_UPSTREAM_URL:'',RATE_LIMIT_PER_MINUTE:'60'},
    stdio:'ignore'
  });
  t.after(()=>child.kill());
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('server exited');
    try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready);
  for(const route of ['/health','/api/foods?q=rice','/missing']){
    const response=await fetch(base+route);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.match(response.headers.get('content-type'),/application\/json/);
  }
});

test('supplier timeout stays active while response body is pending',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  let observedAbort=false;
  const fakeFetch=async (_target,{signal})=>{
    const stream=new ReadableStream({
      start(controller){
        controller.enqueue(new TextEncoder().encode('{"products":['));
        signal.addEventListener('abort',()=>{
          observedAbort=true;
          controller.error(new Error('aborted_supplier_stream'));
        },{once:true});
      }
    });
    return new Response(stream,{status:200,headers:{'content-type':'application/json'}});
  };
  await assert.rejects(()=>fetchSupplierJson('https://example.com','',25,fakeFetch),/aborted_supplier_stream/);
  assert.equal(observedAbort,true);
});

test('supplier timeout is cleared after successful body read',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  const result=await fetchSupplierJson('https://example.com','',1000,async()=>new Response('{"products":[]}',{headers:{'content-type':'application/json; charset=utf-8'}}));
  assert.deepEqual(result,{ok:true,data:{products:[]}});
});

test('rejects blank and oversized search queries before contacting supplier',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    env:{...process.env,PORT:String(port),RATE_LIMIT_PER_MINUTE:'60',FOOD_UPSTREAM_URL:''},
    stdio:'ignore'
  });
  t.after(()=>child.kill());
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('server exited');
    try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready);
  for(const query of ['', '   ', 'x'.repeat(121)]){
    const response=await fetch(base+'/api/foods?q='+encodeURIComponent(query));
    assert.equal(response.status,400);
    assert.equal((await response.json()).error,'invalid_query');
  }
  const boundary=await fetch(base+'/api/foods?q='+encodeURIComponent('x'.repeat(120)));
  assert.equal(boundary.status,503,'valid query requires a shopping supplier');
});

test('handles upstream HTTP failure without parsing its response body',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  const result=await fetchSupplierJson('https://example.com','',1000,async()=>new Response('bad gateway',{status:503}));
  assert.deepEqual(result,{ok:false});
});

test('supplier fetch rejects non-JSON content type',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  for(const contentType of ['text/html','text/plain','application/javascript','']){
    const result=await fetchSupplierJson('https://example.com','',1000,async()=>new Response('{"products":[]}',{headers:{'content-type':contentType}}));
    assert.deepEqual(result,{ok:false});
  }
  const valid=await fetchSupplierJson('https://example.com','',1000,async()=>new Response('{"products":[]}',{headers:{'content-type':'application/json; charset=utf-8'}}));
  assert.deepEqual(valid,{ok:true,data:{products:[]}});
});

test('supplier fetch cancels rejected non-JSON response streams',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  let canceled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('<html>'));},
    cancel(){canceled=true;}
  });
  const result=await fetchSupplierJson('https://example.com','',1000,async()=>new Response(stream,{headers:{'content-type':'text/html'}}));
  assert.deepEqual(result,{ok:false});
  assert.equal(canceled,true);
});

test('supplier fetch cancels unsuccessful HTTP response streams',async()=>{
  const {fetchSupplierJson}=await import('./index.mjs');
  let canceled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('service unavailable'));},
    cancel(){canceled=true;}
  });
  const result=await fetchSupplierJson('https://example.com','',1000,async()=>new Response(stream,{status:503,headers:{'content-type':'text/plain'}}));
  assert.deepEqual(result,{ok:false});
  assert.equal(canceled,true);
});

test('rejects invisible-only and overlong HTTP searches before supplier lookup',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    env:{...process.env,PORT:String(port),RATE_LIMIT_PER_MINUTE:'60',FOOD_UPSTREAM_URL:''},
    stdio:'ignore'
  });
  t.after(()=>child.kill());
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null) throw Error('server exited before ready');
    try {if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready);
  for(const q of ['\u200b\ufeff','\u00a0 \u200b','a'.repeat(121),'사과\u0000배','사과\u000a배','사과\u007f배']){
    const response=await fetch(base+'/api/foods?q='+encodeURIComponent(q));
    assert.equal(response.status,400,'invalid search must be rejected: '+JSON.stringify(q));
    assert.equal((await response.json()).error,'invalid_query');
  }
  assert.equal((await fetch(base+'/api/foods?q='+encodeURIComponent('국산 사과'))).status,503,'valid query requires a shopping supplier');
});

test('serves genuine CSV survey prices through HTTP with no paid provider',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bestfood-csv-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const csvPath=join(dir,'survey.csv');
 const csv=['상품명,조사일,판매가격,판매업소,세일여부,원플러스원','국산 사과,2026-11-10,3200,마트A,Y,N','배,2026-11-10,4900,마트B,N,Y'].join(String.fromCharCode(10));
 await writeFile(csvPath,csv,'utf8');
 const port=await freePort();
 const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),FOOD_UPSTREAM_URL:'',CONSUMER_PRICE_CSV_PATH:csvPath,RATE_LIMIT_PER_MINUTE:'60'},stdio:'ignore'});
 t.after(()=>child.kill());
 const base='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<60;i++){
   if(child.exitCode!==null)throw Error('CSV server exited before ready');
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.ok(ready);
 assert.deepEqual(await (await fetch(base+'/health')).json(),{ok:true,providerConfigured:true,csvReady:true});
 const response=await fetch(base+'/api/foods?q='+encodeURIComponent('사과'));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.products.length,0);
 assert.equal(data.candidates.length,1);
 assert.equal(data.candidates[0].name,'국산 사과');
 assert.equal(data.candidates[0].price,3200);
 assert.equal(data.candidates[0].seller,'마트A');
 assert.equal(data.candidates[0].saleStatus,'Y');
 assert.equal(data.candidates[0].onePlusOne,'N');
 assert.equal(data.candidates[0].surveyDate,'2026-11-10');
 assert.equal(data.candidates[0].rating,null);
});


test('authorized shopping mall listings show real-name price and seller without unit sizes',async()=>{
 const {normalizeMallListings}=await import('./index.mjs');
 const data={candidates:[
  {name:'만두 1kg',price:7900,seller:'쿠팡',url:'https://www.coupang.com/vp/products/123'},
  {name:'만두 800g',price:6900,seller:'컬리',url:'https://www.kurly.com/goods/456'},
  {name:'만두 잘못된 링크',price:1000,seller:'미확인',url:'javascript:alert(1)'},
  {name:'만두 잘못된 가격',price:0,seller:'미확인',url:'https://example.com/x'},
  {name:'사과 1kg',price:1000,seller:'쿠팡',url:'https://example.com/apple'}
 ]};
 const result=normalizeMallListings(data,'만두');
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>x.seller),['컬리','쿠팡']);
 assert.deepEqual(result.map(x=>x.price),[6900,7900]);
 assert.equal(result[0].rank,1);
 assert.equal(result[0].unitPrice,null);
 assert.equal(result[0].rating,undefined);
 assert.equal(result[0].url,'https://www.kurly.com/goods/456');
});
