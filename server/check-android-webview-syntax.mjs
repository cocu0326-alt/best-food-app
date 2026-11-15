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
