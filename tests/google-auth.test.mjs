import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {verifyGoogleIdToken} from '../google-auth.mjs';

const clientId='123456789-test.apps.googleusercontent.com';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});
const keys=async()=>({keys:[{...jwk,kid:'trusted',alg:'RS256',use:'sig'}]});
const now=Math.floor(Date.now()/1000);
function credential(override={},key=privateKey){
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'trusted',typ:'JWT'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub:'stable-google-id',name:'Google Customer',email:'customer@example.com',email_verified:true,iat:now,exp:now+3600,...override})).toString('base64url');
 const content=header+'.'+claims;
 return content+'.'+sign('RSA-SHA256',Buffer.from(content),key).toString('base64url');
}
test('Google ID token signature, audience, issuer, lifetime and verified identity are required',async()=>{
 assert.deepEqual(await verifyGoogleIdToken(credential(),clientId,keys),{sub:'stable-google-id',name:'Google Customer',email:'customer@example.com'});
 for(const claims of [{aud:'another-client'},{iss:'https://attacker.test'},{exp:now-1},{iat:now+600},{email_verified:false},{sub:''}]){
  await assert.rejects(verifyGoogleIdToken(credential(claims),clientId,keys),/Invalid Google credential/);
 }
 const impostor=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
 await assert.rejects(verifyGoogleIdToken(credential({},impostor),clientId,keys),/Invalid Google credential/);
 await assert.rejects(verifyGoogleIdToken('not-a-token',clientId,keys),/Invalid Google credential/);
});

test('Google sign-in stays disabled without configuration and never accepts an unverified credential', {timeout:20000},async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vinayak-google-auth-'));let child;
 try{
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin='https://customer.example.test',base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',APP_ORIGIN:origin,PORT:String(port),HOST:'127.0.0.1',SALON_DATA_DIR:temp,SALON_OWNER_PASSWORD:'owner-test-password-123',SALON_OWNER_PASSWORD_FILE:'',GOOGLE_CLIENT_ID:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(t);resolve()});child.once('exit',code=>{clearTimeout(t);reject(Error('Startup failed: '+code))});});
  const config=await fetch(base+'/api/customer/google-config');assert.deepEqual(await config.json(),{clientId:null});
  const response=await fetch(base+'/api/customer/google-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({credential:credential()})});assert.equal(response.status,503);
  const page=await fetch(base+'/profile.html');assert.match(await page.text(),/id="google-signin"/);
  assert.equal((await fetch(base+'/google-login.mjs')).status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self' https:\/\/accounts.google.com/);
 }finally{
  if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM')});
  const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('vinayak-google-auth-'))throw Error('Unexpected cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
