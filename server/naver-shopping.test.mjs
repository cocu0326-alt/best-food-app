import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNaverItems} from './index.mjs';

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
