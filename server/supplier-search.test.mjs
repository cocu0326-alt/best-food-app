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
