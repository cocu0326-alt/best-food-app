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
  assert.equal(product.seller,'판매처 미확인');
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
  assert.equal(product.source,'공급업체 제공 (원출처 미확인)');
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
  assert.equal(blank.source,'공급업체 제공 (원출처 미확인)');
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

test('rejects fractional or unsafe prices and extreme sizes',()=>{
  const base={name:'상품',price:2000,size:500,unit:'g'};
  const results=normalizeSupplierFeed({products:[
    {...base,price:1.5},
    {...base,price:Number.MAX_SAFE_INTEGER+1},
    {...base,price:'9007199254740993'},
    {...base,size:1000000001},
    {...base,size:1000001,unit:'kg'},
    {...base,price:2000,size:1000000000},
    {...base,price:'2500',size:500}
  ]}).products;
  assert.equal(results.length,2);
  assert.deepEqual(results.map(p=>p.price),[2000,2500]);
});

test('supplier product links reject URL fragments and credentials',()=>{
  const base={name:'사과',price:3000,size:500,unit:'g'};
  const products=normalizeSupplierFeed({products:[
    {...base,url:'https://example.com/item#secret'},
    {...base,url:'https://user:pass@example.com/item'},
    {...base,url:' http://example.com/item '},
    {...base,url:' https://example.com/item '}
  ]}).products;
  assert.deepEqual(products.map(p=>p.url),['','','','https://example.com/item']);
});

test('blank seller uses supplied manufacturer rather than unknown seller',()=>{
  const base={name:'현미',price:3200,size:500,unit:'g'};
  const products=normalizeSupplierFeed({products:[
    {...base,seller:'  ',manufacturer:'  생산자 A  '},
    {...base,seller:'판매자 B',manufacturer:'생산자 A'},
    {...base,seller:'  ',manufacturer:'  '}
  ]}).products;
  assert.deepEqual(products.map(p=>p.seller),['생산자 A','판매자 B','판매처 미확인']);
});

test('blank measure uses supplied unit without changing quantity conversion',()=>{
  const base={name:'식품',price:2500,size:2};
  const products=normalizeSupplierFeed({products:[
    {...base,measure:' ',unit:' kg '},
    {...base,measure:'mL',unit:'kg'},
    {...base,measure:' ',unit:'  '}
  ]}).products;
  assert.deepEqual(products.map(p=>[p.size,p.measure]),[[2000,'g'],[2,'mL']]);
});

test('blank size falls back to supplied amount but invalid nonblank size is rejected',()=>{
  const base={name:'잡곡',price:4000,unit:'kg',amount:2};
  const products=normalizeSupplierFeed({products:[
    {...base,size:'   '},
    {...base,size:null},
    {...base,size:0},
    {...base,size:true}
  ]}).products;
  assert.deepEqual(products.map(p=>[p.size,p.measure]),[[2000,'g'],[2000,'g']]);
});

test('array-shaped supplier entries are not valid product objects',()=>{
  const disguised=Object.assign([],{name:'위장 상품',price:1000,size:100,unit:'g'});
  const products=normalizeSupplierFeed({products:[disguised,{name:'정상 상품',price:1000,size:100,unit:'g'}]}).products;
  assert.deepEqual(products.map(p=>p.name),['정상 상품']);
});

test('unsafe integer review counts cannot influence supplier ranking',()=>{
  const base={name:'검증 식품',price:3000,size:300,unit:'g'};
  const products=normalizeSupplierFeed({products:[
    {...base,reviews:Number.MAX_SAFE_INTEGER+1},
    {...base,reviews:'9007199254740992'},
    {...base,reviews:Number.MAX_SAFE_INTEGER}
  ]}).products;
  assert.deepEqual(products.map(p=>p.reviews),[0,0,Number.MAX_SAFE_INTEGER]);
});

test('seller display names collapse repeated whitespace and normalize Unicode',()=>{
  const base={name:'국산 콩',price:2400,size:300,unit:'g'};
  const products=normalizeSupplierFeed({products:[
    {...base,seller:'  우리  \t농장  '},
    {...base,seller:'',manufacturer:'  생산  농장  '},
    {...base,seller:'  카페'.normalize('NFD')}
  ]}).products;
  assert.deepEqual(products.map(p=>p.seller),['우리 농장','생산 농장','카페']);
});

test('supplier product display names normalize invisible whitespace and Unicode',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'  유기농\u200b  사과  ',price:5000,size:500,unit:'g'},
    {name:'  카페'.normalize('NFD'),price:4000,size:200,unit:'g'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.name),['유기농 사과','카페']);
});

test('supplier feed excludes names made only of invisible whitespace',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'\u200b\ufeff',price:5000,size:500,unit:'g'},
    {name:'\u00a0 \u200b',price:5000,size:500,unit:'g'},
    {name:'정상 사과',price:5000,size:500,unit:'g'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.name),['정상 사과']);
});

test('supplier seller names normalize invisible spaces for consistent display',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'현미',price:5000,size:500,unit:'g',seller:'\u200b 청정\u200b  농장\ufeff'},
    {name:'보리',price:4000,size:500,unit:'g',manufacturer:'\u00a0산들\u200b 농장'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.seller),['청정 농장','산들 농장']);
});

test('invisible-only seller falls back to manufacturer or unknown seller',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'쌀',price:5000,size:500,unit:'g',seller:'\u200b\ufeff',manufacturer:'산들 농장'},
    {name:'보리',price:4000,size:500,unit:'g',seller:'\u200b',manufacturer:'\u00a0\ufeff'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.seller),['산들 농장','판매처 미확인']);
});

test('source with invisible-only text is marked unverified, and real source is normalized',()=>{
  const products=normalizeSupplierFeed({products:[
    {name:'쌀',price:5000,size:500,unit:'g',source:'\u200b\ufeff'},
    {name:'보리',price:4000,size:500,unit:'g',source:'\u00a0산지\u200b  공급사\ufeff'}
  ]}).products;
  assert.deepEqual(products.map(p=>p.source),['공급업체 제공 (원출처 미확인)','산지 공급사']);
});
