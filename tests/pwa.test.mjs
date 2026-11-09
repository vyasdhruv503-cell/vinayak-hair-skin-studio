import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
test('Install metadata and deployment include the real logo and app assets', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',root)));
  assert.equal(manifest.display,'standalone'); assert.equal(manifest.scope,'/');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(new URL(icon.src.slice(1),root)));
  for (const name of ['index.html','profile.html','gallery.html','owner.html']) {
    const html = fs.readFileSync(new URL(name,root),'utf8');
    assert.match(html,/rel="manifest"/); assert.match(html,/src="\/app.mjs"/);
  }
  const docker=fs.readFileSync(new URL('Dockerfile',root),'utf8');
  for (const name of ['sw.js','manifest.webmanifest','app.mjs','offline.html','install.html']) assert.ok(docker.includes(name));
});
test('Offline worker never stores private pages or intercepts API writes', async () => {
  const listeners={},stored=[]; let online=true;
  const context={URL,self:{location:{origin:'https://salon.test'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>listeners[name]=fn},caches:{open:async()=>({addAll:async files=>stored.push(...files)}),keys:async()=>[],match:async()=> 'offline-screen'},fetch:async()=>{if(!online)throw Error('offline');return 'live-page'}};
  vm.runInNewContext(fs.readFileSync(new URL('sw.js',root),'utf8'),context);
  let ready;listeners.install({waitUntil:p=>ready=p});await ready;
  assert.deepEqual(stored,['/offline.html','/app-icon-192.png']);
  for (const request of [{url:'https://salon.test/api/book',method:'POST',mode:'cors'},{url:'https://salon.test/api/customer/me',method:'GET',mode:'cors'},{url:'https://salon.test/media/gallery/id',method:'GET',mode:'cors'}]) {
    let intercepted=false;listeners.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  }
  const request={url:'https://salon.test/profile.html',method:'GET',mode:'navigate'};
  let response;listeners.fetch({request,respondWith:p=>response=p});assert.equal(await response,'live-page');
  online=false;listeners.fetch({request,respondWith:p=>response=p});assert.equal(await response,'offline-screen');
  assert.deepEqual(stored,['/offline.html','/app-icon-192.png']);
});
