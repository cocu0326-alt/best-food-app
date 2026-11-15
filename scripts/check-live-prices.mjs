import {fetchPublicWeeklyPrices} from '../server/public-weekly-prices.mjs';
try {
 const items=await fetchPublicWeeklyPrices();
 if(!items.length)throw Error('no official prices extracted');
 console.log(JSON.stringify({ok:true,source:'한국소비자원 참가격',count:items.length,sample:items.slice(0,5).map(x=>({name:x.name,price:x.price}))},null,2));
} catch(error){
 console.error('Official price live check failed:',error.message);
 process.exitCode=1;
}
