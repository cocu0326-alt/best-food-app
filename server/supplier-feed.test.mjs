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

test('preserves origin and ingredients while bounding supplied metadata',()=>{
  const result=normalizeSupplierFeed({products:[{
    name:'테스트 과자',price:1200,size:80,unit:'g',
    origin:'국내산'.repeat(100),
    ingredients:'밀가루, 설탕'.repeat(200),
    source:'가상 공급자'.repeat(100),
    updatedAt:'2026-11-15T12:00:00Z'
  }]});
  const product=result.products[0];
  assert.equal(product.origin.length,200);
  assert.equal(product.ingredients.length,1000);
  assert.equal(product.source.length,120);
  assert.equal(product.sourceUpdatedAt,'2026-11-15T12:00:00Z');
});

test('defaults missing provenance and rejects malformed optional provenance',()=>{
  const result=normalizeSupplierFeed({products:[{
    name:'테스트 두부',price:2000,size:300,unit:'g',
    origin:{country:'KR'},ingredients:['콩'],source:123,updatedAt:42
  }]});
  const product=result.products[0];
  assert.equal(product.origin,'');
  assert.equal(product.ingredients,'');
  assert.equal(product.source,'제조사 제공');
  assert.equal(product.sourceUpdatedAt,null);
});

test('treats whitespace-only origin and ingredients as missing',()=>{
  const result=normalizeSupplierFeed({products:[{
    name:'테스트 식품',price:2000,size:200,unit:'g',
    origin:'  \t ',ingredients:'   ',
    source:'  제조사 제공  '
  }]});
  const product=result.products[0];
  assert.equal(product.origin,'');
  assert.equal(product.ingredients,'');
  assert.equal(product.name,'테스트 식품');
});

test('keeps supplied provenance without inventing missing origin or ingredients',()=>{
  const result=normalizeSupplierFeed({products:[{
    name:'테스트 식품',price:2000,size:200,unit:'g',
    origin:' 국내산 ',ingredients:' 콩 100% '
  }]});
  assert.equal(result.products[0].origin,'국내산');
  assert.equal(result.products[0].ingredients,'콩 100%');
  const missing=normalizeSupplierFeed({products:[{name:'테스트 식품',price:2000,size:200,unit:'g'}]});
  assert.equal(missing.products[0].origin,'');
  assert.equal(missing.products[0].ingredients,'');
});

test('rejects boolean, empty and nonnumeric price or quantity values',()=>{
  const base={name:'테스트 식품',price:2000,size:200,unit:'g'};
  const invalid=[
    {...base,price:true},{...base,size:true},
    {...base,price:' '},{...base,size:''},
    {...base,price:'abc'},{...base,size:{}},
    {...base,price:null},{...base,size:null}
  ];
  assert.equal(normalizeSupplierFeed({products:invalid}).products.length,0);
  const valid=normalizeSupplierFeed({products:[{...base,price:'2000',size:'200'}]}).products;
  assert.equal(valid.length,1,'numeric strings remain compatible with supplier feeds');
});

test('invalid optional ratings and reviews are safely normalized',()=>{
  const base={name:'테스트 식품',price:2000,size:200,unit:'g'};
  const products=[
    {...base,rating:true,reviews:true},
    {...base,rating:' ',reviews:''},
    {...base,rating:6,reviews:-1},
    {...base,rating:'4.5',reviews:'12'}
  ];
  const results=normalizeSupplierFeed({products}).products;
  assert.deepEqual(results.map(p=>p.rating),[0,0,0,4.5]);
  assert.deepEqual(results.map(p=>p.reviews),[0,0,0,12]);
});

test('blank supplier provenance labels fall back without inventing update dates',()=>{
  const base={name:'상품',price:1200,size:100,unit:'g'};
  const [blank,trimmed]=normalizeSupplierFeed({products:[
    {...base,source:'  ',updatedAt:'  '},
    {...base,source:'  공식 제공  ',updatedAt:' 2026-11-15 '}
  ]}).products;
  assert.equal(blank.source,'제조사 제공');
  assert.equal(blank.sourceUpdatedAt,null);
  assert.equal(trimmed.source,'공식 제공');
  assert.equal(trimmed.sourceUpdatedAt,'2026-11-15');
});

test('supplier units tolerate surrounding whitespace but reject non-string units',()=>{
  const base={name:'식품',price:1500,size:2};
  const results=normalizeSupplierFeed({products:[
    {...base,unit:' KG '},
    {...base,unit:' l '},
    {...base,unit:100},
    {...base,unit:true},
    {...base,unit:'pieces'}
  ]}).products;
  assert.equal(results.length,2);
  assert.deepEqual(results.map(p=>[p.size,p.measure]),[[2000,'g'],[2000,'mL']]);
});
