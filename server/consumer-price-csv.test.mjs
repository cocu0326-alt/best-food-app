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
