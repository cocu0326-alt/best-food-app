import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicWeeklyPrices,searchPublicWeeklyPrices,fetchPublicWeeklyPrices} from './public-weekly-prices.mjs';

test('extracts official weekly prices and rejects arbitrary numbers',()=>{
 const html='<html><body><div>고향만두(900g)</div><span>금주</span><b>8,780</b><span>2주전 대비 500</span></body></html>';
 const prices=parsePublicWeeklyPrices(html);
 assert.equal(prices.length,1);
 assert.equal(prices[0].name,'고향만두(900g)');
 assert.equal(prices[0].price,8780);
 assert.equal(searchPublicWeeklyPrices(prices,'만두').length,1);
 assert.equal(searchPublicWeeklyPrices(prices,'우유').length,0);
});

test('fails closed if official page has no recognized price data',async()=>{
 await assert.rejects(fetchPublicWeeklyPrices(async()=>new Response('<html>maintenance</html>',{headers:{'content-type':'text/html'}})),/public_price_format_changed/);
});

test('rejects oversized official price page before reading response body',async()=>{
 let read=false;
 const fake={ok:true,headers:new Headers({'content-type':'text/html','content-length':'3000001'}),body:{getReader(){read=true;throw Error('must not read')}}};
 await assert.rejects(fetchPublicWeeklyPrices(async()=>fake),/public_price_page_too_large/);
 assert.equal(read,false);
});

test('official homepage price adapter supports egg packs and food sachets',()=>{
 const html='<section>풀무원 동물복지 유정란(10개) 금주 9,507 2주전 대비 260</section><section>매일두유 99.9(12팩) 금주 11,394 2주전 대비 234</section>';
 const prices=parsePublicWeeklyPrices(html);
 assert.ok(prices.some(x=>x.name.includes('유정란')&&x.price===9507));
 assert.ok(prices.some(x=>x.name.includes('매일두유')&&x.price===11394));
});
