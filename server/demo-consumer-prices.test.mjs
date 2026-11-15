import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConsumerPriceCsv} from './consumer-price-csv.mjs';

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
