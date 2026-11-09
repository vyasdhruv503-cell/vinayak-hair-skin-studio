import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vinayak-test-'));
const origin='https://salon.example.test',password='test-only-'+randomUUID();let child;
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function start(port,bootstrap=true){
 const env={...process.env,NODE_ENV:'production',APP_ORIGIN:origin,PORT:String(port),HOST:'127.0.0.1',SALON_DATA_DIR:path.join(scratch,'data')};delete env.SALON_OWNER_PASSWORD;delete env.SALON_OWNER_PASSWORD_FILE;
 if(bootstrap){const file=path.join(scratch,'test-password.txt');fs.writeFileSync(file,password);env.SALON_OWNER_PASSWORD_FILE=file;}
 child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited before ready: '+code))});});
}
async function stop(){if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM')});}
test('Production configuration, bookings, persistence and backup',{timeout:45000},async()=>{
 try{
  const missing=spawnSync(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',APP_ORIGIN:'',SALON_DATA_DIR:''},encoding:'utf8'});assert.notEqual(missing.status,0);
  const noSecretEnv={...process.env,NODE_ENV:'production',APP_ORIGIN:origin,SALON_DATA_DIR:path.join(scratch,'empty')};delete noSecretEnv.SALON_OWNER_PASSWORD;delete noSecretEnv.SALON_OWNER_PASSWORD_FILE;
  const noSecret=spawnSync(process.execPath,['server.mjs'],{cwd:root,env:noSecretEnv,encoding:'utf8'});assert.notEqual(noSecret.status,0);assert.match(noSecret.stderr,/first production start/);
  const insecure=spawnSync(process.execPath,['server.mjs'],{cwd:root,env:{...noSecretEnv,APP_ORIGIN:'http://salon.example.test'},encoding:'utf8'});assert.notEqual(insecure.status,0);assert.match(insecure.stderr,/HTTPS in production/);
  const port=await freePort(),base=`http://127.0.0.1:${port}`;let cookie='',customerCookie='';
  async function api(url,method='GET',body,owner=false,requestOrigin=origin){const cookies=[owner?cookie:'',url==='/api/bookings'?customerCookie:''].filter(Boolean).join('; ');return fetch(base+url,{method,headers:{Origin:requestOrigin,...(body?{'Content-Type':'application/json'}:{}),...(cookies?{Cookie:cookies}:{})},body:body?JSON.stringify(body):undefined})}
  await start(port);assert.equal((await api('/healthz')).status,200);assert.equal((await api('/api/owner/bookings')).status,401);
  const login=await api('/api/login','POST',{password});assert.equal(login.status,200);const c=login.headers.get('set-cookie');assert.match(c,/Secure/);assert.match(c,/HttpOnly/);assert.match(c,/SameSite=Strict/);cookie=c.split(';')[0];
  const slot={service:'haircut',date:'2030-01-02',start:'10:00',end:'10:30'};const created=await api('/api/owner/slots','POST',slot,true);assert.equal(created.status,201);const s=await created.json();
  assert.equal((await api('/api/owner/slots','POST',{...slot,service:'hydra',start:'10:15',end:'11:00'},true)).status,409);
  assert.equal((await api('/api/owner/slots','POST',{...slot,date:'2030-02-30'},true)).status,400);assert.equal((await api('/api/owner/slots','POST',{...slot,start:'06:30'},true)).status,400);
  assert.equal((await api('/api/owner/slots','POST',{...slot,start:'07:00',end:'07:30'},true)).status,400);
  assert.equal((await api('/api/owner/slots','POST',{...slot,start:'21:00',end:'21:31'},true)).status,400);
  const booking={slot:s.id,name:'Test Customer',phone:'9999999999',notes:'Test data'};
  assert.equal((await api('/api/bookings','POST',booking)).status,401);
  const account=await api('/api/customer/register','POST',{username:'test-customer',name:'Test Customer',phone:'9999999999',password});assert.equal(account.status,200);customerCookie=account.headers.get('set-cookie').split(';')[0];
  const simultaneous=await Promise.all([api('/api/bookings','POST',booking),api('/api/bookings','POST',booking)]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);const booked=await simultaneous.find(r=>r.status===201).json();assert.equal(booked.id,booked.reference);
  assert.equal((await(await api('/api/slots?service=haircut&date=2030-01-02')).json()).length,0);
  assert.equal((await api('/api/bookings','POST',booking,false,'https://attacker.example')).status,403);assert.equal((await api('/api/bookings','POST',booking,false,base)).status,403);
  assert.equal((await fetch(base+'/api/bookings',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:customerCookie},body:'null'})).status,400);
  for(const url of ['/server.mjs','/.env','/data/salon.sqlite'])assert.equal((await api(url)).status,404);
  assert.equal((await api('/logo.jpg')).headers.get('content-type'),'image/jpeg');const homepage=await api('/');assert.equal(homepage.status,200);assert.match(homepage.headers.get('content-security-policy'),/script-src 'self'/);assert.ok(homepage.headers.get('strict-transport-security'));
  const backupPath=path.join(scratch,'backup.sqlite');const backup=spawnSync(process.execPath,['scripts/backup.mjs',backupPath],{cwd:root,env:{...process.env,SALON_DATA_DIR:path.join(scratch,'data')},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);const backupDb=new DatabaseSync(backupPath,{readOnly:true});assert.equal(backupDb.prepare('SELECT count(*) AS n FROM bookings').get().n,1);backupDb.close();
  await stop();await start(port,false);const again=await api('/api/login','POST',{password});assert.equal(again.status,200);cookie=again.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/api/bookings','POST',booking)).status,401);
  const customerLogin=await api('/api/customer/login','POST',{username:'test-customer',password});assert.equal(customerLogin.status,200);customerCookie=customerLogin.headers.get('set-cookie').split(';')[0];
  const retained=await(await api('/api/owner/bookings','GET',undefined,true)).json();assert.equal(retained.length,1);assert.equal(retained[0].id,booked.reference);
  assert.equal((await api('/api/owner/cancel','POST',{id:booked.reference},true)).status,200);assert.equal((await(await api('/api/slots?service=haircut&date=2030-01-02')).json()).length,1);assert.equal((await api('/api/bookings','POST',booking)).status,201);
  assert.equal((await api('/api/logout','POST',{},true)).status,200);assert.equal((await api('/api/owner/bookings','GET',undefined,true)).status,401);
 }finally{await stop();const resolved=path.resolve(scratch);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('vinayak-test-'))throw Error('Unexpected cleanup path');fs.rmSync(resolved,{recursive:true,force:true});}
});
