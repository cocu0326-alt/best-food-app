import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConsumerPriceCsv,compareSurveyPrices} from './consumer-price-csv.mjs';

const csv = readFileSync(new URL('../samples/demo-consumer-prices.csv', import.meta.url), 'utf8');

test('bundled sample milk search returns both stores and the correct lowest price', () => {
  const rows = parseConsumerPriceCsv(csv, '저지방 우유');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.price).sort((a,b) => a-b), [2900,3200]);
  assert.equal(rows.find(x => x.price === 2900).seller, '예시마트B');
  assert.ok(rows.every(x => x.surveyDate === '2026-11-10'));
});

test('bundled sample banana search stays separate from milk', () => {
  const rows = parseConsumerPriceCsv(csv, '바나나');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.price).sort((a,b) => a-b), [4100,4500]);
  assert.ok(rows.every(x => x.name.includes('바나나')));
});

test('unknown sample product does not produce fabricated matches', () => {
  assert.deepEqual(parseConsumerPriceCsv(csv, '없는상품'), []);
});


test('sample price comparisons show accurate differences for the same survey date',()=>{
 const summaries=compareSurveyPrices(parseConsumerPriceCsv(csv));
 const milk=summaries.find(x=>x.name.includes('우유'));
 const banana=summaries.find(x=>x.name.includes('바나나'));
 assert.equal(milk.lowestPrice,2900);
 assert.equal(milk.highestPrice,3200);
 assert.equal(milk.difference,300);
 assert.deepEqual(milk.lowestSellers,['예시마트B']);
 assert.equal(banana.difference,400);
 assert.equal(milk.isHistoricalSurvey,true);
});

test('price comparisons do not mix different survey dates',()=>{
 const rows=parseConsumerPriceCsv(['상품명,조사일,판매가격,판매업소','우유,2026-11-01,1000,마트A','우유,2026-11-02,5000,마트B'].join(String.fromCharCode(10)));
 const summaries=compareSurveyPrices(rows);
 assert.equal(summaries.length,2);
 assert.ok(summaries.every(x=>x.difference===0));
});
