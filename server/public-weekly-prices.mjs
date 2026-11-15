// Public, no-key source: Korea Consumer Agency price.go.kr homepage.
// Extract only visible product names and weekly average prices; never infer seller prices.
const HOME='https://www.price.go.kr/';
const TTL=6*60*60*1000;
let cache=null;
export function parsePublicWeeklyPrices(html){
 if(typeof html!=='string'||html.length>3_000_000)throw Error('invalid_price_page');
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
 const result=[];
 const pattern=/([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s().·-]{2,90}\(\d+(?:\.\d+)?(?:kg|g|L|ml)\))\s*금주\s*([\d,]{3,12})/gi;
 for(const match of text.matchAll(pattern)){
  const name=match[1].trim(),price=Number(match[2].replace(/,/g,''));
  if(!Number.isSafeInteger(price)||price<100||price>1000000)continue;
  if(!result.some(x=>x.name===name))result.push({name,price,seller:'한국소비자원 전국 유통업체 조사 평균',source:'한국소비자원 참가격 홈페이지 주간 평균가격',sourceUrl:HOME,surveyDate:null,size:null,measure:null,rating:null,reviews:null,url:HOME});
 }
 return result.slice(0,150);
}
export async function fetchPublicWeeklyPrices(fetchImpl=fetch,now=Date.now()){
 if(cache&&now-cache.time<TTL)return cache.items;
 const response=await fetchImpl(HOME,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
 if(!response.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw Error('public_price_unavailable');
 const body=await response.text();
 const items=parsePublicWeeklyPrices(body);
 if(!items.length)throw Error('public_price_format_changed');
 cache={time:now,items};return items;
}
export function searchPublicWeeklyPrices(items,query){
 const terms=String(query||'').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(x=>terms.every(t=>x.name.normalize('NFKC').toLowerCase().replace(/\s+/g,'').includes(t.replace(/\s+/g,''))));
}
