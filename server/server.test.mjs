import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSupplierFeed} from './supplier-feed.mjs';
import {searchSupplierProducts, fetchSupplierJson, readBoundedJson, server} from './index.mjs';

const sample={products:[
  {name:'국산 사과',price:5000,size:1,unit:'kg',rating:4.5,reviews:12,seller:'농장 A',url:'https://example.com/apple'},
  {name:'유기농 배',price:4000,size:500,unit:'g',rating:4.1,reviews:7,seller:'농장 B'},
  {name:'불량 상품',price:-1,size:100,unit:'g',rating:5,reviews:0,seller:'농장 C'}
]};
test('supplier adapter converts kg to g and rejects invalid prices',()=>{
  const products=normalizeSupplierFeed(sample).products;
  assert.equal(products.length,2);
  assert.equal(products[0].size,1000);
  assert.equal(products[0].measure,'g');
});
test('supplier data without genuine ratings is not assigned fabricated zero reviews',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'평점 없는 상품',price:1000,size:100,unit:'g',seller:'A'},
    {name:'리뷰 없는 상품',price:1000,size:100,unit:'g',rating:4.5,seller:'A'},
    {name:'정상 상품',price:1000,size:100,unit:'g',rating:0,reviews:0,seller:'A'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.name),['평점 없는 상품','리뷰 없는 상품','정상 상품']);
  assert.deepEqual(products.map(p=>p.rating),[null,4.5,0]);
  assert.deepEqual(products.map(p=>p.reviews),[null,null,0]);
});
test('supplier search matches Korean names and returns only valid products',()=>{
  const results=searchSupplierProducts(sample,'사과');
  assert.equal(results.length,1);
  assert.equal(results[0].name,'국산 사과');
  assert.equal(searchSupplierProducts(sample,'존재하지않는상품').length,0);
});
test('supplier fetch sends credentials only in Authorization header and disables redirects',async()=>{
  let observed;
  const result=await fetchSupplierJson(new URL('https://provider.example/foods?q=apple'),'private-token',1000,async (url,options)=>{
    observed={url:url.href,headers:options.headers,redirect:options.redirect};
    return new Response(JSON.stringify({products:[]}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.data,{products:[]});
  assert.equal(observed.headers.authorization,'Bearer private-token');
  assert.equal(observed.redirect,'error');
  assert.ok(!observed.url.includes('private-token'));
});
test('supplier fetch rejects non-JSON responses and oversized feeds',async()=>{
  const nonJson=await fetchSupplierJson('https://provider.example', '',1000,async()=>new Response('<html/>',{headers:{'content-type':'text/html'}}));
  assert.equal(nonJson.ok,false);
  await assert.rejects(readBoundedJson(new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'application/json'}})),/feed_too_large/);
});
test('server replies with safe CORS headers and never grants unknown origins',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    for(const origin of ['null','https://untrusted.example']){
      const response=await fetch(base+'/health',{headers:{Origin:origin}});
      assert.equal(response.status,200);
      // Default is deny-by-omission. A null origin is never enabled implicitly.
      assert.equal(response.headers.get('access-control-allow-origin'),null);
    }
  } finally {await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
test('API health and unconfigured provider responses',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const health=await fetch(base+'/health');
    assert.equal(health.status,200);
    assert.deepEqual(await health.json(),{ok:true,providerConfigured:false,csvReady:false});
    const missing=await fetch(base+'/api/foods?q='+encodeURIComponent('사과'));
    assert.equal(missing.status,503);
    assert.equal((await missing.json()).error,'shopping_provider_not_configured');
    const invalid=await fetch(base+'/api/foods?q=');
    assert.equal(invalid.status,400);
    const unknown=await fetch(base+'/not-found');
    assert.equal(unknown.status,404);
  } finally {await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
