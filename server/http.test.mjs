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
