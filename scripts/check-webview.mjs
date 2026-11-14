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

const sample = {include:[],exclude:[],products:[
  {id:101,name:'국산 쌀 A',price:10000,size:1000,measure:'g',rating:4.5,reviews:20,seller:'생산자 직거래',quality:4,transparency:1,origin:'국내산',ingredients:'쌀'},
  {id:102,name:'국산 쌀 B',price:15000,size:1000,measure:'g',rating:4.2,reviews:15,seller:'제조사 공식몰',quality:5,transparency:1,origin:'국내산',ingredients:'쌀'}
]};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {value: id === 'sort' ? 'score' : '', innerHTML:'', textContent:''});
  return elements.get(id);
};
const storage = new Map([['bestfood_v1',JSON.stringify(sample)]]);
const sandbox = {
  document:{getElementById:element},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
  console,URL,Date,Math,Number,String,Array,JSON,Set,confirm:()=>true,alert:()=>{}
};
vm.createContext(sandbox);
for(const match of scripts) vm.runInContext(match[1],sandbox,{timeout:3000});
assert.match(element('results').innerHTML,/국산 쌀 A/,'Product list should render');
assert.match(element('comparison').innerHTML,/2개/,'Comparison summary should show product count');
vm.runInContext('toggleCompare(101,true);toggleCompare(102,true)',sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/국산 쌀 A/,'First product should be in comparison');
assert.match(element('compareResults').innerHTML,/국산 쌀 B/,'Second product should be in comparison');
assert.match(element('compareResults').innerHTML,/최저 판매가격/,'Price comparison should render');
assert.match(element('compareResults').innerHTML,/국내산/,'Origin should be visible');
vm.runInContext('toggleCompare(102,false)',sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/현재 1개 선택됨/,'Unselecting should update comparison');
console.log('PASS: WebView simulated rendering, comparison selection and removal');
