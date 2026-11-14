import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSupplierFeed} from './supplier-feed.mjs';

test('converts kg to grams and preserves provenance',()=>{
 const result=normalizeSupplierFeed({products:[{name:'쌀',price:15000,size:2,unit:'kg',manufacturer:'생산자',origin:'국내산',source:'제조사 공급',updatedAt:'2026-11-14'}]});
 assert.equal(result.products[0].size,2000);
 assert.equal(result.products[0].measure,'g');
 assert.equal(result.products[0].origin,'국내산');
});
test('rejects invalid product and unsafe links',()=>{
 const result=normalizeSupplierFeed({products:[{name:'A',price:10,size:100,unit:'g',url:'javascript:alert(1)'},{name:'B',price:-1,size:2,unit:'kg'}]});
 assert.equal(result.products.length,1);
 assert.equal(result.products[0].url,'');
});
