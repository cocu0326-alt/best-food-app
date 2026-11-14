import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSupplierProducts} from './index.mjs';

const fixture={
  products:[
    {name:'테스트 사과 1kg',price:6000,size:1,unit:'kg',seller:'가상 판매자'},
    {name:'테스트 사과 500g',price:3500,size:500,unit:'g',seller:'가상 판매자'},
    {name:'테스트 우유 1L',price:2500,size:1,unit:'L',seller:'가상 판매자'},
    {name:'테스트 사과 오류',price:-100,size:1,unit:'kg'}
  ]
};

test('filters matching supplier products and normalizes units',()=>{
  const products=searchSupplierProducts(fixture,'사과');
  assert.equal(products.length,2);
  assert.deepEqual(products.map(p=>p.size),[1000,500]);
  assert.ok(products.every(p=>p.measure==='g'));
});

test('supports case-insensitive supplier product search',()=>{
  const products=searchSupplierProducts({products:[{name:'TEST MILK',price:2000,size:1,unit:'L'}]},'milk');
  assert.equal(products.length,1);
  assert.equal(products[0].size,1000);
  assert.equal(products[0].measure,'mL');
});

test('returns empty results for unmatched queries and rejects malformed feed',()=>{
  assert.deepEqual(searchSupplierProducts(fixture,'바나나'),[]);
  assert.throws(()=>searchSupplierProducts({items:[]},'사과'),/invalid_upstream_schema/);
});

test('caps returned search results at 100 and normalizes at most 1000 input products',()=>{
  const products=Array.from({length:1200},(_,i)=>({
    name:'테스트 사과 '+i,price:1000+i,size:100,unit:'g'
  }));
  const results=searchSupplierProducts({products},'테스트 사과');
  assert.equal(results.length,100);
  assert.equal(results[0].name,'테스트 사과 0');
  assert.equal(results[99].name,'테스트 사과 99');
  const beyond=searchSupplierProducts({products},'테스트 사과 1199');
  assert.equal(beyond.length,0,'products after the first 1000 are not processed');
});

test('does not mutate supplier response objects during search',()=>{
  const data={products:[{name:'테스트 쌀',price:5000,size:1,unit:'kg'}]};
  const snapshot=JSON.stringify(data);
  searchSupplierProducts(data,'쌀');
  assert.equal(JSON.stringify(data),snapshot);
});

test('deduplicates identical listings but keeps distinct sellers and prices',()=>{
  const products=[
    {name:'테스트 사과',price:3000,size:500,unit:'g',seller:'농장 A'},
    {name:' 테스트 사과 ',price:3000,size:0.5,unit:'kg',seller:'농장 A'},
    {name:'테스트 사과',price:3000,size:500,unit:'g',seller:'농장 B'},
    {name:'테스트 사과',price:3500,size:500,unit:'g',seller:'농장 A'}
  ];
  const results=searchSupplierProducts({products},'사과');
  assert.equal(results.length,3);
  assert.deepEqual(results.map(p=>[p.seller,p.price]),[['농장 A',3000],['농장 B',3000],['농장 A',3500]]);
});

test('deduplicates before applying the 100-result cap',()=>{
  const products=[
    ...Array.from({length:110},()=>({name:'테스트 쌀',price:1000,size:1,unit:'kg',seller:'동일 판매자'})),
    ...Array.from({length:110},(_,i)=>({name:'테스트 쌀',price:2000+i,size:1,unit:'kg',seller:'다른 판매자'}))
  ];
  const results=searchSupplierProducts({products},'쌀');
  assert.equal(results.length,100);
  assert.equal(results[0].price,1000);
  assert.equal(results[1].price,2000);
});

test('search normalizes Korean Unicode and repeated whitespace and deduplicates equivalent names',()=>{
  const composed='카페';
  const decomposed=composed.normalize('NFD');
  const feed={products:[
    {name:'유기농  '+composed+' 원두',price:9000,size:200,unit:'g',seller:'판매자'},
    {name:'유기농 '+decomposed+' 원두',price:9000,size:200,unit:'g',seller:'판매자'},
    {name:'유기농 다른 원두',price:9000,size:200,unit:'g',seller:'판매자'}
  ]};
  const result=searchSupplierProducts(feed,' 유기농  '+decomposed+' ');
  assert.equal(result.length,1);
  assert.equal(result[0].price,9000);
});

test('equivalent seller names with repeated whitespace are deduplicated',()=>{
  const products=searchSupplierProducts({products:[
    {name:'국산 보리',price:4000,size:500,unit:'g',seller:'우리  농장'},
    {name:'국산 보리',price:4000,size:500,unit:'g',seller:'우리 농장'},
    {name:'국산 보리',price:4000,size:500,unit:'g',seller:'다른 농장'}
  ]},'보리');
  assert.equal(products.length,2);
  assert.deepEqual(products.map(p=>p.seller),['우리 농장','다른 농장']);
});

test('supplier search matches seller name without duplicating products',()=>{
  const products=searchSupplierProducts({products:[
    {name:'국산 현미',price:8000,size:1000,unit:'g',seller:'청정  농장'},
    {name:'국산 현미',price:8000,size:1000,unit:'g',seller:'청정 농장'},
    {name:'국산 현미',price:8000,size:1000,unit:'g',seller:'다른 농장'}
  ]},'청정 농장');
  assert.equal(products.length,1);
  assert.equal(products[0].seller,'청정 농장');
});
