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
  if (!elements.has(id)) elements.set(id, {value: id === 'sort' ? 'score' : id === 'measureFilter' ? 'all' : '', innerHTML:'', textContent:'', style:{display:''}, checked:false});
  return elements.get(id);
};
const storage = new Map([['bestfood_v1',JSON.stringify(sample)]]);
const sandbox = {
  document:{getElementById:element},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
  console,URL,Date,Math,Number,String,Array,JSON,Set,window:{},TextEncoder,AbortController,setTimeout,clearTimeout,confirm:()=>true,alert:()=>{}
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

vm.runInContext("state.products.push({id:103,name:'사과즙 C',price:9000,size:1000,measure:'mL',rating:4,reviews:5,seller:'농가',quality:null,transparency:null,origin:'국내산',ingredients:'사과'});toggleCompare(102,true);toggleCompare(103,true)",sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/단위가격 우열은 표시하지 않습니다/,'Mixed units must not be ranked by unit price');
assert.match(element('compareResults').innerHTML,/미확인/,'Missing quality should be shown as unverified');
vm.runInContext('toggleCompare(101,true)',sandbox,{timeout:3000});
assert.equal(vm.runInContext('compareIds.size',sandbox),3,'Three products can be selected');
vm.runInContext('toggleCompare(104,true)',sandbox,{timeout:3000});
assert.equal(vm.runInContext('compareIds.size',sandbox),3,'Comparison must remain capped at three products');
console.log('PASS: mixed-unit safeguards, missing quality and selection limit');

const beforeCount = vm.runInContext('state.products.length',sandbox);
Object.assign(element('name'),{value:'테스트 김치'});
Object.assign(element('price'),{value:'8000'});
Object.assign(element('size'),{value:'500'});
Object.assign(element('rating'),{value:'4.3'});
Object.assign(element('reviews'),{value:'10'});
Object.assign(element('seller'),{value:'생산자'});
Object.assign(element('url'),{value:''});
Object.assign(element('unit'),{value:'g'});
Object.assign(element('quality'),{value:'4'});
Object.assign(element('transparency'),{value:'1'});
Object.assign(element('evidence'),{value:'원재료 확인'});
vm.runInContext('addProduct()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products.length',sandbox),beforeCount+1,'Adding a valid product should work');
assert.match(storage.get('bestfood_v1'),/테스트 김치/,'New product should be persisted');
const createdId = vm.runInContext('state.products[state.products.length-1].id',sandbox);
sandbox.prompt = (message,defaultValue) => message.includes('품질 근거') ? '원산지 증빙' : '5';
vm.runInContext('editProduct('+JSON.stringify(createdId)+')',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products[state.products.length-1].quality',sandbox),5,'Editing quality should persist');
assert.match(storage.get('bestfood_v1'),/원산지 증빙/,'Edited evidence should be saved');
vm.runInContext('del('+JSON.stringify(createdId)+')',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products.length',sandbox),beforeCount,'Deleting a product should work');
assert.doesNotMatch(storage.get('bestfood_v1'),/테스트 김치/,'Deleted product should not remain in backup data');
console.log('PASS: product add/edit/delete and localStorage persistence');

let exportedText = '';
sandbox.Blob = class { constructor(parts){exportedText=parts.join('')} };
sandbox.URL.createObjectURL = ()=>'blob:mock';
sandbox.URL.revokeObjectURL = ()=>{};
sandbox.setTimeout = fn=>fn();
sandbox.document.createElement = ()=>({click(){},remove(){}});
sandbox.document.body = {appendChild(){}};
vm.runInContext('exportData()',sandbox,{timeout:3000});
const backup=JSON.parse(exportedText);
assert.equal(backup.products.length,beforeCount,'Export must contain persisted products');
assert.equal(backup.version,1,'Export format version should be included');
let input={files:[{text:JSON.stringify({...backup,include:['복원 확인']})}],value:'selected'};
sandbox.FileReader=class {readAsText(file){this.result=file.text;this.onload()}};
vm.runInContext('importData(input)',vm.createContext({...sandbox,input}),{timeout:3000});
assert.match(storage.get('bestfood_v1'),/복원 확인/,'Valid backup should restore search terms');
const goodData=storage.get('bestfood_v1');
input={files:[{text:'{bad json'}],value:'selected'};
vm.runInContext('importData(input)',vm.createContext({...sandbox,input}),{timeout:3000});
assert.equal(storage.get('bestfood_v1'),goodData,'Invalid JSON must not overwrite existing data');
input={files:[{text:JSON.stringify({...backup,products:[{name:'bad',price:-1}]})}],value:'selected'};
vm.runInContext('importData(input)',vm.createContext({...sandbox,input}),{timeout:3000});
assert.equal(storage.get('bestfood_v1'),goodData,'Invalid product must not overwrite existing data');
console.log('PASS: JSON backup export, restore and invalid-file safeguards');

// Normalize legacy mock responses to the real fetch Response interface.
let mockedFetch;
Object.defineProperty(sandbox,'fetch',{
  configurable:true,
  get(){return mockedFetch},
  set(fn){mockedFetch=async (...args)=>{
    const response=await fn(...args);
    if(typeof response.text!=='function'&&typeof response.json==='function'){
      const data=await response.json();
      response.text=async()=>JSON.stringify(data);
    }
    if(!response.headers)response.headers={get:()=>null};
    return response;
  }}
});
const beforeApi=vm.runInContext('state.products.length',sandbox);
element('apiEndpoint').value='https://example.test/api/foods';
element('term').value='쌀';
sandbox.fetch=async()=>({ok:true,json:async()=>({products:[
  {name:'API 쌀',price:12000,size:1000,measure:'g',rating:4.4,reviews:30,seller:'농장',origin:'국내산',ingredients:'쌀'},
  {name:'API 쌀',price:12000,size:1000,measure:'g',rating:4.4,reviews:30,seller:'농장'},
  {name:'오류 상품',price:-1,size:0,measure:'g',rating:4,reviews:1}
]})});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products.length',sandbox),beforeApi+1,'API must add only one valid unique product');
assert.match(element('apiStatus').textContent,/1개 신규 등록/,'API result should report accepted count');
assert.equal(vm.runInContext('state.products[state.products.length-1].quality',sandbox),null,'Imported supplier data must not imply verified quality');
assert.equal(vm.runInContext('state.products[state.products.length-1].transparency',sandbox),null,'Imported supplier data must not imply verified manufacturing transparency');
assert.equal(vm.runInContext('state.products[state.products.length-1].origin',sandbox),'국내산','Imported origin should be retained');
sandbox.fetch=async()=>({ok:true,json:async()=>({products:[
  {name:'API 원산지 미확인',price:2500,size:300,measure:'g',rating:4,reviews:2,seller:'농장',origin:'   ',ingredients:'  '}
]})});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products[state.products.length-1].origin',sandbox),'','Whitespace-only origin must be treated as missing');
assert.equal(vm.runInContext('state.products[state.products.length-1].ingredients',sandbox),'','Whitespace-only ingredients must be treated as missing');
assert.equal(vm.runInContext('state.products[state.products.length-1].quality',sandbox),null,'Missing provenance must not create quality score');
const beforeMalformed=vm.runInContext('state.products.length',sandbox);
sandbox.fetch=async()=>({ok:true,json:async()=>({products:[
  {name:'잘못된 가격',price:true,size:100,measure:'g',rating:4,reviews:2},
  {name:'소수점 가격',price:1.5,size:100,measure:'g',rating:4,reviews:2},
  {name:'초과 용량',price:2000,size:1000000001,measure:'g',rating:4,reviews:2},
  {name:'잘못된 리뷰',price:2000,size:100,measure:'g',rating:4,reviews:true},
  {name:'잘못된 평점',price:2000,size:100,measure:'g',rating:' ',reviews:2}
]})});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products.length',sandbox),beforeMalformed,'Malformed numeric supplier fields must not be imported');
sandbox.fetch=async()=>({ok:true,json:async()=>({products:[
  {name:'보안 URL 검사',price:3300,size:300,measure:'g',rating:4,reviews:3,seller:'판매자',url:'https://user:pass@example.test/item#token'}
]})});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products[state.products.length-1].url',sandbox),'','Credential-bearing supplier product URL must be discarded');
assert.equal(vm.runInContext('state.products.length',sandbox),beforeApi+3,'Product with invalid optional URL remains importable');
sandbox.fetch=async()=>({ok:false,status:503});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.match(element('apiStatus').textContent,/조회 실패/,'API failure should show a helpful error');
assert.equal(vm.runInContext('state.products.length',sandbox),beforeApi+3,'Failed API must not alter products');
for(const [code,expected] of [[400,'검색어가 올바르지 않습니다'],[429,'요청이 너무 많습니다'],[502,'상품 공급업체 응답에 문제가 있습니다'],[503,'상품 공급 API가 아직 연결되지 않았습니다']]){
  sandbox.fetch=async()=>({ok:false,status:code});
  await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
  assert.match(element('apiStatus').textContent,new RegExp(expected),'HTTP '+code+' should display a specific error');
  assert.equal(vm.runInContext('state.products.length',sandbox),beforeApi+3,'HTTP error must not alter products');
}
console.log('PASS: API search, duplicate filtering, invalid item rejection and server error');

element('apiEndpoint').value='https://example.test/api/foods';
sandbox.fetch=async url=>({ok:true,json:async()=>({ok:true,providerConfigured:false})});
await vm.runInContext('checkEndpoint()',sandbox,{timeout:3000});
assert.match(element('apiStatus').textContent,/공급 API 미설정/,'Health check must distinguish missing provider');
sandbox.fetch=async url=>({ok:true,json:async()=>({ok:true,providerConfigured:true})});
await vm.runInContext('checkEndpoint()',sandbox,{timeout:3000});
assert.match(element('apiStatus').textContent,/상품 공급 API 설정됨/,'Health check should show configured provider');
element('apiEndpoint').value='http://example.test/api/foods';
await vm.runInContext('checkEndpoint()',sandbox,{timeout:3000});
assert.match(element('apiStatus').textContent,/HTTPS/,'Health check must reject non-HTTPS URLs');
console.log('PASS: API health check status and HTTPS validation');

assert.equal(vm.runInContext("validApiUrl('https://example.test/api/foods')",sandbox),true,'Valid HTTPS API endpoint accepted');
assert.equal(vm.runInContext("validApiUrl('https://user:secret@example.test/api/foods')",sandbox),false,'Credential-bearing endpoint rejected');
assert.equal(vm.runInContext("validApiUrl('https://example.test/api/foods#fragment')",sandbox),false,'Fragment endpoint rejected');
assert.equal(vm.runInContext("validApiUrl('https://example.test/other')",sandbox),false,'Wrong API path rejected');
assert.equal(vm.runInContext("validApiUrl('http://example.test/api/foods')",sandbox),false,'Plain HTTP rejected');
console.log('PASS: API endpoint validation');

assert.match(html,/공급업체 제공 정보로, 앱이 독립 검증한 결과가 아닙니다/,'Supplier provenance disclaimer must be visible');
assert.match(html,/공급업체 정보 미검증 · 품질 근거 확인 필요/,'API import status must not imply verified data');

vm.runInContext("state.products.push({id:901,name:'비교 쌀 A',price:10000,size:1000,measure:'g',rating:4.5,reviews:20,seller:'농가',quality:4,transparency:1},{id:902,name:'비교 쌀 B',price:9000,size:1000,measure:'g',rating:4.3,reviews:15,seller:'농가',quality:5,transparency:1});toggleCompare(901,true);toggleCompare(902,true)",sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/품질·가격 균형/,'Comparison must explain quality-price balance when two products are selected');
assert.match(html,/품질 미평가 상품 /,'Missing quality must prevent balance recommendations');
vm.runInContext("state.products.find(p=>p.id===901).quality=null;renderCompare()",sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/품질 미평가 상품 비교 쌀 A/,'Missing quality must identify the unevaluated food');
assert.match(element('compareResults').innerHTML,/원재료·원산지·제조정보 등 근거를 확인한 후 품질을 평가해 주세요/,'Missing quality must prompt evidence review');

assert.match(html,/동일 단위라도 식품 종류·원재료·가공방식이 다르면/,'Comparison must warn against cross-category unit-price conclusions');
assert.match(html,/외부 상품 전체의 최우수 제품 선정이 아닙니다/,'Comparison must limit recommendation scope');

vm.runInContext("state.products.find(p=>p.id===901).quality=4;renderCompare()",sandbox,{timeout:3000});

vm.runInContext("state.products.push({id:903,name:'비교 쌀 공동최저',price:9000,size:1000,measure:'g',rating:4.1,reviews:10,seller:'농가',quality:4,transparency:1});toggleCompare(903,true)",sandbox,{timeout:3000});
assert.match(element('compareResults').innerHTML,/비교 쌀 B \(입력 품질 5\/5\), 비교 쌀 공동최저 \(입력 품질 4\/5\)/,'Equal unit-price foods should show both winners and their user quality scores');

// Missing seller metadata must not create a duplicate on repeated API searches.
element('apiEndpoint').value='https://example.test/api/foods';
element('term').value='판매처 없는 상품';
sandbox.fetch=async()=>({ok:true,json:async()=>({products:[{name:'판매처 없는 상품',price:3900,size:300,measure:'g',rating:0,reviews:0}]})});
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
const afterMissingSeller=vm.runInContext('state.products.length',sandbox);
assert.equal(vm.runInContext('state.products[state.products.length-1].seller',sandbox),'판매처 미확인','Unknown supplier seller must not be presented as manufacturer');
assert.equal(vm.runInContext('state.products[state.products.length-1].source',sandbox),'공급업체 제공 (원출처 미확인)','Unknown source must not imply direct manufacturer provenance');
await vm.runInContext('fetchProducts()',sandbox,{timeout:3000});
assert.equal(vm.runInContext('state.products.length',sandbox),afterMissingSeller,'Repeated supplier search must not duplicate products without seller metadata');
assert.match(element('apiStatus').textContent,/0개 신규 등록/,'Repeated search should report zero new products');

assert.match(html,/공급업체 제공 \(원출처 미확인\)/,'WebView must use neutral supplier source fallback');
assert.match(html,/판매처 미확인/,'WebView must not invent a direct manufacturer seller');

assert.match(html,/원산지',p=>p.origin\|\|'공급업체 정보 없음'/,'Missing origin must be labeled as absent from supplier data');
assert.match(html,/원재료',p=>p.ingredients\|\|'공급업체 정보 없음'/,'Missing ingredients must be labeled as absent from supplier data');

assert.match(html,/출처',p=>p.source\|\|'출처 정보 없음'/,'Missing source must be identified explicitly');
assert.match(html,/갱신일',p=>p.sourceUpdatedAt\|\|'갱신일 정보 없음'/,'Missing update date must not imply freshness');

assert.match(html,/판매처',p=>p.seller\|\|'판매처 정보 없음'/,'Missing seller must be identified explicitly in comparison');

assert.match(element('compareResults').innerHTML,/같은 단위라도 식품 종류·구성·가공방식이 다르면/,'Comparison summary must warn against unlike-food price ranking');
assert.match(element('compareResults').innerHTML,/품질 점수는 사용자 입력값이며 외부 검증 결과가 아닙니다/,'Comparison summary must disclose unverified quality');
