// Offline adapter for the freely downloadable Korean Consumer Agency price CSV.
// Preview only: survey prices are not current online checkout prices.
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > 80_000_000) throw Error('invalid_csv_size');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}
    else if(ch==='"'){if(cell)throw Error('invalid_csv_quote');quoted=true}
    else if(ch===','){row.push(cell);cell=''}
    else if(ch==='\n'||ch==='\r'){row.push(cell);rows.push(row);row=[];cell='';if(ch==='\r'&&text[i+1]==='\n')i++;if(rows.length>300000)throw Error('too_many_rows')}
    else cell+=ch;
  }
  if(quoted)throw Error('unclosed_csv_quote');
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
export function parseConsumerPriceCsv(text, query='',limit=100) {
  const rows=parseCsv(text.replace(/^\uFEFF/,''));
  if(!rows.length)return [];
  const headers=rows.shift().map(v=>v.trim().replace(/\s+/g,''));
  const col=(...names)=>headers.findIndex(h=>names.includes(h));
  const name=col('상품명'),price=col('판매가격','가격'),seller=col('판매업소','판매점','업소명'),date=col('조사일','조사일자');
  if([name,price,seller,date].some(i=>i<0))throw Error('missing_required_columns');
  const manufacturer=col('제조사','제조업체');
  const sale=col('세일여부'),onePlusOne=col('원플러스원');
  const q=query.normalize('NFC').trim().toLowerCase();
  const out=[];
  for(const row of rows){
    if(out.length>=limit)break;
    const title=(row[name]||'').trim(),store=(row[seller]||'').trim(),day=(row[date]||'').trim();
    if(!title||!store||!/^\d{4}[-./]\d{2}[-./]\d{2}$/.test(day))continue;
    const [year,month,dayOfMonth]=day.split(/[-./]/).map(Number);
    const actual=new Date(0);
    actual.setUTCFullYear(year,month-1,dayOfMonth);
    if(actual.getUTCFullYear()!==year||actual.getUTCMonth()+1!==month||actual.getUTCDate()!==dayOfMonth)continue;
    if(q&&!title.normalize('NFC').toLowerCase().includes(q))continue;
    const amount=Number((row[price]||'').replace(/[\s,원]/g,''));
    if(!Number.isSafeInteger(amount)||amount<=0)continue;
    out.push({name:title.slice(0,200),price:amount,seller:store.slice(0,120),surveyDate:day,manufacturer:manufacturer>=0?(row[manufacturer]||'').trim().slice(0,120):'',saleStatus:sale>=0?(row[sale]||'').trim().slice(0,30):null,onePlusOne:onePlusOne>=0?(row[onePlusOne]||'').trim().slice(0,30):null,source:'한국소비자원 참가격 조사',size:null,measure:null,rating:null,reviews:null,url:''});
  }
  return out;
}
