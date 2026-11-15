import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSupplierFeed} from './supplier-feed.mjs';
import {searchSupplierProducts, server} from './index.mjs';

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
test('supplier search matches Korean names and returns only valid products',()=>{
  const results=searchSupplierProducts(sample,'사과');
  assert.equal(results.length,1);
  assert.equal(results[0].name,'국산 사과');
  assert.equal(searchSupplierProducts(sample,'존재하지않는상품').length,0);
});
test('API health and unconfigured provider responses',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const health=await fetch(base+'/health');
    assert.equal(health.status,200);
    assert.deepEqual(await health.json(),{ok:true,providerConfigured:false});
    const missing=await fetch(base+'/api/foods?q='+encodeURIComponent('사과'));
    assert.equal(missing.status,503);
    assert.equal((await missing.json()).error,'provider_not_configured');
    const invalid=await fetch(base+'/api/foods?q=');
    assert.equal(invalid.status,400);
    const unknown=await fetch(base+'/not-found');
    assert.equal(unknown.status,404);
  } finally {await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
