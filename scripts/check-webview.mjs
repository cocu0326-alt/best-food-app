import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync('app/src/main/assets/index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length > 0, 'No inline JavaScript found');
for (const [i, match] of scripts.entries()) {
  new vm.Script(match[1], {filename: 'index.html#script-' + i});
}
const required = ['id="results"', 'id="comparison"', 'id="compareResults"', 'id="apiEndpoint"', 'function renderCompare()', 'function fetchProducts()', 'function render()'];
for (const item of required) assert.ok(html.includes(item), 'Missing UI element or handler: ' + item);
console.log('PASS: ' + scripts.length + ' script(s) parsed and essential UI hooks found');
