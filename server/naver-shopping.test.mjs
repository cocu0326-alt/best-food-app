import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanNaverTitle,normalizeNaverItems,filterNaverCandidates,loadConsumerSurveyCsv,parseListingPackageSize} from './index.mjs';

test('Naver shopping results retain source prices without invented quality metadata',()=>{
 const items=normalizeNaverItems({items:[{title:'<b>서울</b> 우유',lprice:'3200',link:'https://example.com/item',mallName:'쇼핑몰A'}]});
 assert.equal(items.length,1);
 assert.equal(items[0].name,'서울 우유');
 assert.equal(items[0].price,3200);
 assert.equal(items[0].seller,'쇼핑몰A');
 assert.equal(items[0].size,null);
 assert.equal(items[0].rating,null);
 assert.equal(items[0].reviews,null);
});

test('Naver shopping adapter rejects unsafe links and invalid prices',()=>{
 const items=normalizeNaverItems({items:[
  {title:'상품',lprice:'0',link:'https://example.com/a'},
  {title:'상품',lprice:'5000',link:'http://example.com/b'},
  {title:'상품',lprice:'5000',link:'https://user:pass@example.com/c'},
  {title:'상품',lprice:'5000',link:'https://example.com/d'}
 ]});
 assert.equal(items.length,1);
 assert.equal(items[0].url,'https://example.com/d');
});

test('Naver shopping adapter rejects missing or malformed results',()=>{
 assert.throws(()=>normalizeNaverItems(null),/invalid_naver_schema/);
 assert.throws(()=>normalizeNaverItems({items:{}}),/invalid_naver_schema/);
});


test('survey CSV is read once for unchanged file and reloaded after modification',async()=>{
 let version=1,reads=0;
 const statImpl=async()=>({isFile:()=>true,size:42,mtimeMs:version});
 const readImpl=async()=>{reads++;return Buffer.from('상품명,조사일,판매가격,판매업소\n우유,2026-11-10,3000,마트A')};
 const first=await loadConsumerSurveyCsv('/test/cache-survey.csv',statImpl,readImpl);
 const second=await loadConsumerSurveyCsv('/test/cache-survey.csv',statImpl,readImpl);
 assert.equal(first,second);
 assert.equal(reads,1);
 version=2;
 await loadConsumerSurveyCsv('/test/cache-survey.csv',statImpl,readImpl);
 assert.equal(reads,2);
});

test('survey CSV loader rejects invalid file sizes before reading',async()=>{
 let reads=0;
 await assert.rejects(loadConsumerSurveyCsv('/test/too-large.csv',async()=>({isFile:()=>true,size:80_000_001,mtimeMs:1}),async()=>{reads++;return Buffer.alloc(0)}),/invalid_consumer_csv/);
 assert.equal(reads,0);
});


test('survey CSV loader decodes EUC-KR when UTF-8 is invalid',async()=>{
 const bytes=Buffer.concat([Buffer.from('name\n'),Buffer.from([0xb0,0xa1])]);
 const decoded=await loadConsumerSurveyCsv('/test/euc-kr.csv',async()=>({isFile:()=>true,size:bytes.length,mtimeMs:1}),async()=>bytes);
 assert.equal(decoded,'name\n가');
});


test('Naver results match independent Korean search terms and sort by lowest listing price',()=>{
 const mk=(name,price,seller='몰')=>({name,price,seller,url:'https://example.com/'+price});
 const results=filterNaverCandidates([
  mk('서울 저지방 우유',3500),mk('저지방 서울 우유',2800),mk('초코 우유',2000),mk('서울 저지방 우유',3500)
 ],'우유 저지방');
 assert.deepEqual(results.map(x=>x.price),[2800,3500]);
 assert.deepEqual(filterNaverCandidates(results,'없는상품'),[]);
 assert.deepEqual(filterNaverCandidates(results,'저지방 우유',1).map(x=>x.price),[2800]);
});


test('Naver shopping product titles preserve decoded Korean brand names',()=>{
 assert.equal(cleanNaverTitle('<b>서울</b> 우유 &amp; 치즈'),'서울 우유 & 치즈');
 assert.equal(cleanNaverTitle('우유&nbsp;1L &quot;특가&quot;'),'우유 1L "특가"');
 assert.equal(cleanNaverTitle('A &lt; B &gt; C'), 'A < B > C');
});


test('Naver adapter skips malformed individual records and retains valid listings',()=>{
 const found=normalizeNaverItems({items:[null,false,42,[],{title:'정상 우유',lprice:'2500',link:'https://example.com/milk',mallName:'마트'}]});
 assert.equal(found.length,1);
 assert.equal(found[0].name,'정상 우유');
 assert.equal(found[0].price,2500);
});


test('Naver prices reject booleans, arrays, and scientific notation',()=>{
 const candidates=[true,[],['2500'],'2.5e3',' 2500 ',2500,'2500'].map((lprice,i)=>({title:'우유',lprice,link:'https://example.com/item'+i}));
 const found=normalizeNaverItems({items:candidates});
 assert.deepEqual(found.map(x=>x.price),[2500,2500]);
});


test('Naver candidate filtering tolerates malformed records and rejects invalid prices',()=>{
 const valid={name:'서울 우유',price:2900,seller:'마트',url:'https://example.com/valid'};
 const bad=[null,undefined,false,[],{name:'서울 우유',price:NaN},{name:'서울 우유',price:-1},{name:'서울 우유',price:'1000'}];
 assert.deepEqual(filterNaverCandidates([...bad,valid],'우유'),[valid]);
 assert.deepEqual(filterNaverCandidates(null,'우유'),[]);
});

test('shopping size extraction recognizes only single unambiguous packages',()=>{
 assert.deepEqual(parseListingPackageSize('서울우유 1L'),{size:1000,measure:'ml'});
 assert.deepEqual(parseListingPackageSize('사과주스 500ml'),{size:500,measure:'ml'});
 assert.deepEqual(parseListingPackageSize('쌀 2kg'),{size:2000,measure:'g'});
 assert.deepEqual(parseListingPackageSize('우유 1.5L'),{size:1500,measure:'ml'});
 assert.deepEqual(parseListingPackageSize('우유 0.5L'),{size:500,measure:'ml'});
 assert.deepEqual(parseListingPackageSize('쌀 0.75kg'),{size:750,measure:'g'});
 assert.equal(parseListingPackageSize('우유 0L'),null);
 assert.equal(parseListingPackageSize('우유 0.0L'),null);
 assert.equal(parseListingPackageSize('우유 0.0001L'),null);
 assert.equal(parseListingPackageSize('우유 00.5L'),null);
 assert.equal(parseListingPackageSize('우유 1.2.5L'),null);
 assert.equal(parseListingPackageSize('우유 0.0L'),null);
 assert.deepEqual(parseListingPackageSize('치즈 250g'),{size:250,measure:'g'});
 for(const title of ['우유 1L 2팩','우유 1L x 2','우유 2x500ml','우유 500ml 1L','우유 500ml + 500ml','우유 1L + 1L','우유 1L 증정','우유 용량 미표기','우유 0ml']) {
  assert.equal(parseListingPackageSize(title),null,title);
 }
 const items=normalizeNaverItems({items:[{title:'우유 1L',lprice:'3000',link:'https://example.com/milk'},{title:'우유 1L 2팩',lprice:'5000',link:'https://example.com/bundle'}]});
 assert.deepEqual([items[0].size,items[0].measure],[1000,'ml']);
 assert.equal(items[1].size,null);
});
