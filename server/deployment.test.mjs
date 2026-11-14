import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const blueprint=readFileSync('render.yaml','utf8');
const server=readFileSync('server/index.mjs','utf8');
const guide=readFileSync('server/DEPLOY.md','utf8');

test('deployment blueprint matches server startup and health endpoint',()=>{
  assert.match(blueprint,/startCommand:\s*node server\/index\.mjs/);
  assert.match(blueprint,/healthCheckPath:\s*\/health/);
  assert.match(server,/url\.pathname === '\/health'/);
  assert.match(blueprint,/runtime:\s*node/);
});

test('deployment blueprint declares all external configuration',()=>{
  for(const name of ['FOOD_UPSTREAM_URL','FOOD_API_TOKEN','ALLOWED_ORIGIN','RATE_LIMIT_PER_MINUTE']){
    assert.match(blueprint,new RegExp('key:\\s*'+name+'(?:\\s|$)'));
    assert.ok(server.includes('process.env.'+name),'Server must consume '+name);
    assert.ok(guide.includes(name),'Deployment guide must document '+name);
  }
  assert.match(blueprint,/RATE_LIMIT_PER_MINUTE\s*\n\s*value:\s*['"]?60/);
});

test('supplier credentials are not embedded in deployment config',()=>{
  assert.match(blueprint,/FOOD_API_TOKEN\s*\n\s*sync:\s*false/);
  assert.match(blueprint,/FOOD_UPSTREAM_URL\s*\n\s*sync:\s*false/);
});
