// Offline adapter for the freely downloadable Korean Consumer Agency price CSV.
// Preview only: survey prices are not current online checkout prices.
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > 80_000_000) throw Error('invalid_csv_size');
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"'){quoted=false;afterQuote=true}else cell+=ch}
    else if(afterQuote && ch!==',' && ch!=='\n' && ch!=='\r')throw Error('invalid_csv_quote');
    else if(ch==='"'){if(cell || afterQuote)throw Error('invalid_csv_quote');quoted=true}
    else if(ch===','){row.push(cell);cell='';afterQuote=false}
    else if(ch==='\n'||ch==='\r'){if(rows.length>=300000)throw Error('too_many_rows');row.push(cell);rows.push(row);row=[];cell='';afterQuote=false;if(ch==='\r'&&text[i+1]==='\n')i++;}
    else cell+=ch;
  }
  if(quoted)throw Error('unclosed_csv_quote');
  if(cell||row.length){if(rows.length>=300000)throw Error('too_many_rows');row.push(cell);rows.push(row)}
  return rows;
}
export function parseConsumerPriceCsv(text, query='',limit=100) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw Error('invalid_result_limit');
  if (typeof text !== 'string' || text.length > 80_000_000) throw Error('invalid_csv_size');
  const rows=parseCsv(text.replace(/^\uFEFF/,''));
  if(!rows.length)return [];
  const headers=rows.shift().map(v=>v.replace(/^\uFEFF/,'').trim().replace(/\s+/g,''));
  const col=(...names)=>headers.findIndex(h=>names.includes(h));
  const name=col('상품명','제품명'),price=col('판매가격','판매가격(원)','가격','가격(원)'),seller=col('판매업소','판매업소명','판매점','판매점명','업소명'),date=col('조사일','조사일자','조사일시');
  if([name,price,seller,date].some(i=>i<0))throw Error('missing_required_columns');
  if(limit===0)return [];
  const manufacturer=col('제조사','제조업체');
  const sale=col('세일여부','세일여부(Y/N)'),onePlusOne=col('원플러스원','원플러스원여부','1+1여부');
  const requiredTerms=String(query).normalize('NFC').trim().toLowerCase().split(/\s+/g).filter(Boolean).map(term=>term.replace(/\s+/g,''));
  const out=[];
  for(const row of rows){
    const title=(row[name]||'').trim(),store=(row[seller]||'').trim(),day=(row[date]||'').trim();
    if(!title||!store||!/^\d{4}[-./]\d{2}[-./]\d{2}$/.test(day))continue;
    const [year,month,dayOfMonth]=day.split(/[-./]/).map(Number);
    const actual=new Date(0);
    actual.setUTCFullYear(year,month-1,dayOfMonth);
    if(actual.getUTCFullYear()!==year||actual.getUTCMonth()+1!==month||actual.getUTCDate()!==dayOfMonth)continue;
    const normalizedTitle=title.normalize('NFC').toLowerCase().replace(/\s+/g,'');
    if(!requiredTerms.every(term=>normalizedTitle.includes(term)))continue;
    const rawPrice=(row[price]||'').trim();
    // Accept plain digits or properly grouped thousands, optionally followed by 원.
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\s*원)?$/.test(rawPrice))continue;
    const amount=Number(rawPrice.replace(/[,\s원]/g,''));
    if(!Number.isSafeInteger(amount)||amount<=0)continue;
    out.push({name:title.slice(0,200),price:amount,seller:store.slice(0,120),surveyDate:day.replace(/[./]/g,'-'),manufacturer:manufacturer>=0?(row[manufacturer]||'').trim().slice(0,120):'',saleStatus:sale>=0?(row[sale]||'').trim().slice(0,30):null,onePlusOne:onePlusOne>=0?(row[onePlusOne]||'').trim().slice(0,30):null,source:'한국소비자원 참가격 조사',size:null,measure:null,rating:null,reviews:null,url:''});
  }
  // The source file can be ordered oldest-first; show the newest surveyed prices first.
  out.sort((a,b)=>b.surveyDate.replace(/[-./]/g,'').localeCompare(a.surveyDate.replace(/[-./]/g,''))||a.price-b.price);
  // Keep one record per product/store/date; duplicated source rows must not flood the preview.
  const seen=new Set(),unique=[];
  for(const item of out){
    const key=JSON.stringify([item.name.normalize('NFC').trim(),item.seller.normalize('NFC').trim(),item.surveyDate.replace(/[./]/g,'-'),item.price]);
    if(seen.has(key))continue;
    seen.add(key);unique.push(item);
    if(unique.length>=limit)break;
  }
  return unique;
}
