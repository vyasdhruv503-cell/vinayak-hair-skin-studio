import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Private customer profiles, legacy migration and session-based booking ownership',{timeout:40000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vinayak-customer-'));let child;
 try{
  const db=new DatabaseSync(path.join(temp,'salon.sqlite'));db.exec(`CREATE TABLE slots(id TEXT PRIMARY KEY,service TEXT,date TEXT,start TEXT,end TEXT);CREATE TABLE bookings(id TEXT PRIMARY KEY,slot_id TEXT REFERENCES slots(id),name TEXT,phone TEXT,notes TEXT,status TEXT DEFAULT 'confirmed',created TEXT);INSERT INTO slots VALUES('legacy-slot','haircut','2030-01-02','10:00','10:30');INSERT INTO slots VALUES('legacy-early','haircut','2030-01-02','07:00','07:30');INSERT INTO slots VALUES('legacy-late','haircut','2030-01-02','21:30','22:00');INSERT INTO bookings VALUES('legacy-booking','legacy-slot','Guest Customer','9999999999','','confirmed','2026-10-22');`);db.close();
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const base=`http://127.0.0.1:${port}`,origin='https://customer.example.test',ownerPassword='owner-test-'+randomUUID(),password='customer-test-'+randomUUID();
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',APP_ORIGIN:origin,SALON_DATA_DIR:temp,SALON_OWNER_PASSWORD:ownerPassword,SALON_OWNER_PASSWORD_FILE:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(t);resolve()});child.once('exit',code=>{clearTimeout(t);reject(Error('Startup failed: '+code))})});
  const api=(url,method='GET',body,cookie='')=>fetch(base+url,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const token=r=>r.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/api/customer/profile')).status,401);assert.equal((await api('/api/customer/bookings')).status,401);
  const owner=token(await api('/api/login','POST',{password:ownerPassword}));
  const a=await api('/api/customer/register','POST',{username:'customer-a',name:'Customer A',phone:'9999999999',password});assert.equal(a.status,200);assert.match(a.headers.get('set-cookie'),/Secure/);const cookieA=token(a),idA=(await a.json()).customer.id;
  const b=await api('/api/customer/register','POST',{username:'customer-b',name:'Customer B',phone:'9999999999',password});assert.equal(b.status,200);const cookieB=token(b),idB=(await b.json()).customer.id;
  assert.equal((await api('/api/customer/register','POST',{username:'CUSTOMER-A',name:'Other',phone:'9999999999',password})).status,409);
  assert.equal((await api('/api/customer/login','POST',{username:'does-not-exist',password})).status,401);
  assert.deepEqual(await(await api('/api/customer/bookings','GET',undefined,cookieA)).json(),[]);
  const initialOwnerBookings=await(await api('/api/owner/bookings','GET',undefined,owner)).json();assert.equal(initialOwnerBookings[0].id,'legacy-booking');
  async function slot(start,end){const r=await api('/api/owner/slots','POST',{service:'haircut',date:'2030-01-02',start,end},owner);assert.equal(r.status,201);return (await r.json()).id;}
  const sA=await slot('10:30','11:00'),sB=await slot('11:00','11:30');
  const data={name:'Test appointment',phone:'9999999999',notes:''};
  const available=await(await api('/api/slots?service=haircut&date=2030-01-02')).json();assert.ok(available.every(slot=>slot.start>='07:30'&&slot.end<='21:30'));
  assert.equal((await api('/api/bookings','POST',{...data,slot:'legacy-early'},cookieA)).status,409);
  assert.equal((await api('/api/bookings','POST',{...data,slot:'legacy-late'},cookieA)).status,409);
  assert.equal((await api('/api/bookings','POST',{...data,slot:sA,customer_id:idA})).status,401);
  assert.equal((await api('/api/bookings','POST',{...data,slot:sA},owner)).status,401);
  assert.equal((await api('/api/bookings','POST',{...data,slot:sA,email:'invalid'},cookieA)).status,400);
  const confirmed=await api('/api/bookings','POST',{...data,slot:sA,email:'customer@example.com',whatsappOptIn:true,customer_id:idB},cookieA);assert.equal(confirmed.status,201);const confirmation=await confirmed.json();assert.equal(confirmation.locationUrl,'https://maps.app.goo.gl/RDEsMfAkHjaj4be2A');assert.deepEqual(confirmation.notification,{whatsapp:'not_configured',email:'not_configured'});
  assert.equal((await api('/api/bookings','POST',{...data,slot:sB,customer_id:idA},cookieB)).status,201);
  const historyA=await(await api('/api/customer/bookings','GET',undefined,cookieA)).json(),historyB=await(await api('/api/customer/bookings','GET',undefined,cookieB)).json();assert.equal(historyA.length,1);assert.equal(historyB.length,1);assert.notEqual(historyA[0].id,historyB[0].id);assert.equal(historyA[0].start,'10:30');assert.equal(historyB[0].start,'11:00');
  assert.equal((await api('/api/owner/bookings','GET',undefined,cookieA)).status,401);
  const edit=await api('/api/customer/profile','PUT',{id:idB,name:'Updated Customer A',phone:'8888888888'},cookieA);assert.equal(edit.status,200);const updated=(await edit.json()).customer;assert.equal(updated.id,idA);assert.equal(updated.password,undefined);assert.equal(updated.name,'Updated Customer A');
  assert.equal((await(await api('/api/customer/profile','GET',undefined,cookieB)).json()).customer.name,'Customer B');
  const signedIn=await api('/api/customer/login','POST',{username:'CUSTOMER-A',password});assert.equal(signedIn.status,200);
  assert.equal((await api('/api/customer/logout','POST',{},cookieA)).status,200);assert.equal((await api('/api/customer/profile','GET',undefined,cookieA)).status,401);assert.equal((await api('/api/owner/bookings','GET',undefined,owner)).status,200);
  assert.equal((await api('/profile.html')).status,200);assert.equal((await api('/profile.mjs')).status,200);
 }finally{if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM')});const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('vinayak-customer-'))throw Error('Unexpected cleanup path');fs.rmSync(resolved,{recursive:true,force:true});}
});
