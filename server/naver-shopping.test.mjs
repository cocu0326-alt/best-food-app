import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNaverItems,filterNaverCandidates,loadConsumerSurveyCsv} from './index.mjs';

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
 const readImpl=async()=>{reads++;return Buffer.from('상품명,조사일,판매가격,판매업소\\n우유,2026-11-10,3000,마트A')};
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
 const bytes=Buffer.concat([Buffer.from('name\\n'),Buffer.from([0xb0,0xa1])]);
 const decoded=await loadConsumerSurveyCsv('/test/euc-kr.csv',async()=>({isFile:()=>true,size:bytes.length,mtimeMs:1}),async()=>bytes);
 assert.equal(decoded,'name\\n가');
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
