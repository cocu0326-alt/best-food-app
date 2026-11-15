import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,parseConsumerPriceCsv} from './consumer-price-csv.mjs';
test('quoted CSV commas and newlines are preserved',()=>{
  assert.deepEqual(parseCsv('a,b\n"x,y","line1\nline2"'),[['a','b'],['x,y','line1\nline2']]);
});
test('public survey prices become preview candidates without invented metadata',()=>{
  const csv='상품명,조사일,판매가격,판매업소,제조사\n"맛있는, 만두",2026-10-23,"5,900",마트A,제조사B\n우유,2026-10-23,2500,마트B,제조사C';
  const result=parseConsumerPriceCsv(csv,'만두');
  assert.equal(result.length,1);
  assert.equal(result[0].price,5900);
  assert.equal(result[0].surveyDate,'2026-10-23');
  assert.equal(result[0].rating,null);
  assert.equal(result[0].size,null);
});
test('required columns and malformed prices are rejected',()=>{
  assert.throws(()=>parseConsumerPriceCsv('상품명,가격\na,100'),/missing_required_columns/);
  assert.equal(parseConsumerPriceCsv('상품명,조사일,판매가격,판매업소\na,2026-10-23,없음,마트').length,0);
});

test('rejects impossible survey calendar dates without changing genuine prices',()=>{
  const csv=['상품명,조사일,판매가격,판매업소','사과,2026-02-30,2500,마트A','사과,2024-02-29,2800,마트B'].join(String.fromCharCode(10));
  const found=parseConsumerPriceCsv(csv,'사과');
  assert.equal(found.length,1);
  assert.equal(found[0].price,2800);
  assert.equal(found[0].surveyDate,'2024-02-29');
});

test('reads official sale and one-plus-one columns without inventing discounts',()=>{
 const csv=[
 '상품명,조사일,판매가격,판매업소,세일여부,원플러스원',
 '사과,2026-11-03,2500,마트A,Y,N'
 ].join(String.fromCharCode(10));
 const found=parseConsumerPriceCsv(csv,'사과');
 assert.equal(found.length,1);
 assert.equal(found[0].saleStatus,'Y');
 assert.equal(found[0].onePlusOne,'N');
 const missing=parseConsumerPriceCsv('상품명,조사일,판매가격,판매업소'+String.fromCharCode(10)+'사과,2026-11-03,2500,마트A','사과');
 assert.equal(missing[0].saleStatus,null);
 assert.equal(missing[0].onePlusOne,null);
});

test('accepts common CSV header variants and keeps real sale flags',()=>{
 const csv=['제품명,조사일자,판매가격(원),판매업소명,세일여부(Y/N),1+1여부','우유,2026-11-10,2900,마트,Y,N'].join(String.fromCharCode(10));
 const found=parseConsumerPriceCsv(csv,'우유');
 assert.equal(found.length,1);
 assert.equal(found[0].price,2900);
 assert.equal(found[0].saleStatus,'Y');
 assert.equal(found[0].onePlusOne,'N');
});

test('shows newest survey dates first even when CSV is oldest-first',()=>{
 const csv=['상품명,조사일,판매가격,판매업소','사과,2024-01-10,1000,마트A','사과,2026-11-10,3000,마트B','사과,2025-05-10,2000,마트C'].join(String.fromCharCode(10));
 const found=parseConsumerPriceCsv(csv,'사과',2);
 assert.deepEqual(found.map(x=>x.price),[3000,2000]);
});

test('deduplicates identical source records but preserves different stores',()=>{
 const csv=['상품명,조사일,판매가격,판매업소','사과,2026-11-10,3000,마트A','사과,2026-11-10,3000,마트A','사과,2026-11-10,3000,마트B'].join(String.fromCharCode(10));
 const found=parseConsumerPriceCsv(csv,'사과');
 assert.equal(found.length,2);
 assert.deepEqual(found.map(x=>x.seller),['마트A','마트B']);
});

test('Korean product search ignores spaces in query and survey product name',()=>{
 const csv=['상품명,조사일,판매가격,판매업소','서울 우유 1L,2026-11-10,3200,마트A'].join(String.fromCharCode(10));
 assert.equal(parseConsumerPriceCsv(csv,'서울우유').length,1);
 assert.equal(parseConsumerPriceCsv(csv,'서울  우유').length,1);
 const results=parseConsumerPriceCsv(csv,'우유');
 assert.equal(results.length,1);
 
});


test('accepts UTF-8 BOM at the start of official CSV headers',()=>{
 const csv='\uFEFF상품명,조사일,판매가격,판매업소\n사과,2026-11-12,3500,마트A';
 const found=parseConsumerPriceCsv(csv,'사과');
 assert.equal(found.length,1);
 assert.equal(found[0].price,3500);
});


test('result limit zero returns no survey records and invalid limits fail',()=>{
 const csv='상품명,조사일,판매가격,판매업소\n사과,2026-11-12,3500,마트A';
 assert.deepEqual(parseConsumerPriceCsv(csv,'사과',0),[]);
 assert.equal(parseConsumerPriceCsv(csv,'사과',1).length,1);
 for(const limit of [-1,1.5,NaN,Infinity,'2']){
  assert.throws(()=>parseConsumerPriceCsv(csv,'사과',limit),/invalid_result_limit/);
 }
});


test('zero result limit still rejects invalid CSV input types',()=>{
 for(const value of [null,undefined,42,{},[]]){
  assert.throws(()=>parseConsumerPriceCsv(value,'',0),/invalid_csv_size/);
 }
});


test('zero result limit cannot bypass maximum CSV size',()=>{
 const oversized='x'.repeat(80_000_001);
 assert.throws(()=>parseConsumerPriceCsv(oversized,'',0),/invalid_csv_size/);
});


test('rejects stray characters after a closing CSV quote',()=>{
 assert.throws(()=>parseCsv('name,price\n"apple"junk,3500'),/invalid_csv_quote/);
 assert.deepEqual(parseCsv('name,price\n"apple",3500'),[['name','price'],['apple','3500']]);
 assert.deepEqual(parseCsv('name,price\n"a""b",3500'),[['name','price'],['a"b','3500']]);
});


test('only valid Korean survey price formats are accepted',()=>{
 const csv=['상품명,조사일,판매가격,판매업소',
  '사과,2026-11-10,3500,마트A',
  '사과,2026-11-10,"3,500",마트B',
  '사과,2026-11-10,3500원,마트C',
  '사과,2026-11-10,3원500,마트D',
  '사과,2026-11-10,"35,00",마트E',
  '사과,2026-11-10,1e3,마트F'].join('\n');
 const found=parseConsumerPriceCsv(csv,'사과');
 assert.deepEqual(found.map(x=>x.seller),['마트A','마트B','마트C']);
 assert.deepEqual(found.map(x=>x.price),[3500,3500,3500]);
});


test('multiple search words match independently and in either order',()=>{
 const csv=['상품명,조사일,판매가격,판매업소','저지방 서울 우유 1L,2026-11-10,3100,마트A','초코 우유 1L,2026-11-10,2900,마트B'].join('\n');
 assert.deepEqual(parseConsumerPriceCsv(csv,'우유 저지방').map(x=>x.seller),['마트A']);
 assert.deepEqual(parseConsumerPriceCsv(csv,'저지방 우유').map(x=>x.seller),['마트A']);
 assert.deepEqual(parseConsumerPriceCsv(csv,'우유 초코').map(x=>x.seller),['마트B']);
});


test('CSV parser enforces row cap even when the final line has no newline',()=>{
 const rows=('x'+String.fromCharCode(10)).repeat(300000);
 assert.equal(parseCsv(rows).length,300000);
 assert.throws(()=>parseCsv(rows+'extra'),/too_many_rows/);
});

test('deduplicates equivalent survey dates with different separators',()=>{
 const csv=['상품명,판매가격,판매업소,조사일','우유,3000,마트,2026-11-01','우유,3000,마트,2026.11.01','우유,3000,마트,2026/11/01'].join(String.fromCharCode(10));
 assert.equal(parseConsumerPriceCsv(csv,'우유').length,1);
});

test('zero-result limit still validates CSV headers',()=>{
 assert.throws(()=>parseConsumerPriceCsv('상품명,가격'+String.fromCharCode(10)+'우유,3000','',0),/missing_required_columns/);
 const valid=['상품명,판매가격,판매업소,조사일','우유,3000,마트,2026-11-01'].join(String.fromCharCode(10));
 assert.deepEqual(parseConsumerPriceCsv(valid,'우유',0),[]);
});


test('rejects stray quotes after a completed quoted CSV field',()=>{
  assert.throws(()=>parseCsv('"milk""oops"extra,price'),/invalid_csv_quote|unclosed_csv_quote/);
  assert.throws(()=>parseCsv('"milk" "oops",price'),/invalid_csv_quote/);
});


test('full-width letters and digits match normal product searches',()=>{
 const csv=['상품명,조사일,판매가격,판매업소','서울우유 １Ｌ,2026-11-10,3200,마트A','ＡＢＣ 우유,2026-11-10,2800,마트B'].join('\n');
 assert.equal(parseConsumerPriceCsv(csv,'1L').length,1);
 assert.equal(parseConsumerPriceCsv(csv,'ABC 우유').length,1);
 assert.equal(parseConsumerPriceCsv(csv,'ＡＢＣ').length,1);
});
