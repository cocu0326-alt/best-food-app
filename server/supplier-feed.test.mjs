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

test('filters invalid amounts and converts liters to milliliters',()=>{
  const products=[
    {name:'우유',price:2500,size:1.5,unit:'L',rating:4.5,reviews:20},
    {name:'가격 오류',price:'Infinity',size:1,unit:'kg'},
    {name:'용량 오류',price:1000,size:0,unit:'g'},
    {name:'단위 오류',price:1000,size:1,unit:'box'}
  ];
  const result=normalizeSupplierFeed({products});
  assert.equal(result.products.length,1);
  assert.equal(result.products[0].measure,'mL');
  assert.equal(result.products[0].size,1500);
  assert.equal(result.products[0].rating,4.5);
});

test('drops credential-bearing links and invalid seller metadata',()=>{
  const result=normalizeSupplierFeed({products:[{
    name:'사과',price:3000,size:500,unit:'g',
    url:'https://user:secret@example.com/product',
    seller:{unexpected:true},rating:9,reviews:-5
  }]});
  const product=result.products[0];
  assert.equal(product.url,'');
  assert.equal(product.seller,'제조사 직접 판매');
  assert.equal(product.rating,0);
  assert.equal(product.reviews,0);
});
