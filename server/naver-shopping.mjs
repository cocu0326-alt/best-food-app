// Naver Shopping OpenAPI: real search results; missing metrics stay unknown.
export function parsePackageSize(title) {
  const clean=String(title).replace(/<[^>]*>/g,' ');
  const matches=[...clean.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/gi)];
  if(matches.length!==1)return null;
  const amount=Number(matches[0][1]),unit=matches[0][2].toLowerCase();
  const size=amount*((unit==='kg'||unit==='l')?1000:1);
  if(!Number.isFinite(size)||size<=0||size>1e9)return null;
  return {size,measure:unit==='g'||unit==='kg'?'g':'mL'};
}
export function normalizeNaverShopping(data){
  if(!data||!Array.isArray(data.items))throw Error('invalid_naver_schema');
  return {products:data.items.flatMap(item=>{
    if(!item||typeof item.title!=='string')return [];
    const name=item.title.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
    const price=Number(item.lprice);
    if(!name||!Number.isSafeInteger(price)||price<=0)return [];
    let url='';
    try{const u=new URL(item.link);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash)url=u.href}catch{}
    const pack=parsePackageSize(name);
    return [{name:name.slice(0,200),price,size:pack?.size??null,measure:pack?.measure??null,rating:null,reviews:null,seller:typeof item.mallName==='string'?item.mallName.slice(0,120):'판매처 미확인',url,source:'네이버쇼핑 검색 API',sourceUpdatedAt:null,origin:'',ingredients:''}];
  })};
}
export async function fetchNaverShopping(q,clientId,clientSecret,fetchImpl=fetch){
  const target=new URL('https://openapi.naver.com/v1/search/shop.json');
  target.searchParams.set('query',q);
  target.searchParams.set('display','100');
  target.searchParams.set('sort','sim');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetchImpl(target.href,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret,Accept:'application/json'},redirect:'error',signal:controller.signal});
    if(!response.ok)throw Error('naver_http_'+response.status);
    const body=await response.text();
    if(body.length>1_000_000)throw Error('naver_response_too_large');
    return normalizeNaverShopping(JSON.parse(body));
  }finally{clearTimeout(timer)}
}
