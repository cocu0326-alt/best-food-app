// Verified public Korean Consumer Agency report, inspected 2026-08-28.
// These are historical aggregated surveyed prices, not seller-specific or live prices.
// Source: https://www.price.go.kr/tprice/portal/pricenews/pricereport/priceReportList.do?inspectDay=28&inspectMonth=08&inspectYear=2026
export const reportDate='2026-08-28';
export const reportUrl='https://www.price.go.kr/tprice/portal/pricenews/pricereport/priceReportList.do?inspectDay=28&inspectMonth=08&inspectYear=2026';
const entries=[
 ['고향만두(900g)',7980,7980,7980],
 ['비비고 왕교자(1.12kg)',9980,11480,10730],
 ['풀무원 얄피꽉찬 고기만두(800g)',7480,10490,9753],
 ['풀무원 얄피꽉찬 쌀물만두(1kg)',7980,11980,10640]
];
export function searchPublishedSurveyPrices(query){
 const terms=String(query||'').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 return entries.filter(([name])=>terms.every(term=>name.normalize('NFKC').toLowerCase().replace(/\s+/g,'').includes(term.replace(/\s+/g,'')))).map(([name,minPrice,maxPrice,averagePrice])=>({
  name,price:averagePrice,minPrice,maxPrice,seller:'전국 유통업체 조사 집계 (개별 판매처 미제공)',
  surveyDate:reportDate,source:'한국소비자원 참가격 공개 가격동향 (평균가격)',
  url:reportUrl,size:null,measure:null,rating:null,reviews:null
 }));
}
