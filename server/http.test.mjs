import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';

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
    env:{...process.env,PORT:String(port),RATE_LIMIT_PER_MINUTE:'2',FOOD_UPSTREAM_URL:''},
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
  assert.deepEqual(health,{ok:true,providerConfigured:false});
  assert.equal((await fetch(base+'/api/foods?q=rice',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/api/foods?q=rice')).status,503);
  assert.equal((await fetch(base+'/api/foods?q=rice')).status,503);
  const limited=await fetch(base+'/api/foods?q=rice');
  assert.equal(limited.status,429);
  assert.equal((await limited.json()).error,'rate_limited');
  assert.equal((await fetch(base+'/health')).status,200,'health remains available');
});

test('rejects upstream URLs containing embedded credentials',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,['server/index.mjs'],{
    env:{...process.env,PORT:String(port),FOOD_UPSTREAM_URL:'https://user:pass@example.com/foods'},
    stdio:'ignore'
  });
  t.after(()=>child.kill());
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null) throw Error('server exited');
    try {if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready);
  const response=await fetch(base+'/api/foods?q=rice');
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'provider_unavailable');
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
