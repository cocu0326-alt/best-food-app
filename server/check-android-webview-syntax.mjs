// Validate the actual JavaScript embedded in the Android WebView asset.
// No dependencies or network calls are required.
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../app/src/main/assets/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)];
if(!scripts.length)throw new Error('No inline scripts found in Android asset');
let checked=0;
for(const [index,match] of scripts.entries()){
  if(!match[1].trim())continue;
  try{new Script(match[1],{filename:'index.html inline script '+(index+1)});checked++}
  catch(error){console.error('Invalid Android WebView JavaScript in script '+(index+1));throw error}
}
if(!checked)throw new Error('No nonempty inline scripts found');
console.log('Validated '+checked+' inline Android WebView script(s)');

// Regression guards for critical Android search paths.
const required=[
 ['typed search precedence',"const q=document.getElementById('term').value.trim()||state.include.join(' ').trim();"],
 ['saved CSV keyword matching','requiredTerms.every(x=>normalizedName.includes(x))'],
 ['survey prices clearly identified','조사가격(현재 판매가 아님)'],
 ['API candidate preview','apiCandidates']
];
for(const [label,fragment] of required){
 if(!html.includes(fragment))throw Error('Missing Android search behavior: '+label);
}
console.log('Validated critical Android search and price-label behavior');
