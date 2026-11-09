import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {services} from './services.mjs';
import {getGoogleRating} from './google-rating.mjs';
import {verifyGoogleIdToken} from './google-auth.mjs';
import {sendBookingNotifications} from './notifications.mjs';
import {salonMapsUrl} from './salon-info.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const production=process.env.NODE_ENV==='production';
const port=Number(process.env.PORT||4311);
const host=process.env.HOST||(production?'0.0.0.0':'127.0.0.1');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be between 1 and 65535.');
if(production&&(!process.env.APP_ORIGIN||!process.env.SALON_DATA_DIR))throw Error('Production requires APP_ORIGIN and an absolute SALON_DATA_DIR on persistent storage.');
const originUrl=new URL(process.env.APP_ORIGIN||`http://127.0.0.1:${port}`);
if(originUrl.username||originUrl.password||originUrl.pathname!=='/'||originUrl.search||originUrl.hash||(production&&originUrl.protocol!=='https:')||!['http:','https:'].includes(originUrl.protocol))throw Error('APP_ORIGIN must be the website origin only, using HTTPS in production.');
const appOrigin=originUrl.origin;
const googleClientId=(process.env.GOOGLE_CLIENT_ID||'').trim();
if(googleClientId&&!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(googleClientId))throw Error('GOOGLE_CLIENT_ID must be a Google OAuth web client ID.');
const dataDir=process.env.SALON_DATA_DIR||path.resolve(root,'../../work/vinayak-data');
if(production&&!path.isAbsolute(dataDir))throw Error('SALON_DATA_DIR must be an absolute path.');
fs.mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'salon.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, service TEXT NOT NULL, date TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY,slot_id TEXT NOT NULL REFERENCES slots(id),name TEXT NOT NULL,phone TEXT NOT NULL,notes TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',created TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_slot ON bookings(slot_id) WHERE status='confirmed';`);
db.exec(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL,password TEXT NOT NULL,created TEXT NOT NULL);`);
if(!db.prepare('PRAGMA table_info(bookings)').all().some(c=>c.name==='customer_id'))db.exec('ALTER TABLE bookings ADD COLUMN customer_id TEXT REFERENCES customers(id)');
if(!db.prepare('PRAGMA table_info(customers)').all().some(c=>c.name==='email'))db.exec("ALTER TABLE customers ADD COLUMN email TEXT NOT NULL DEFAULT ''");
if(!db.prepare('PRAGMA table_info(bookings)').all().some(c=>c.name==='email'))db.exec("ALTER TABLE bookings ADD COLUMN email TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS customer_bookings ON bookings(customer_id)');
db.exec('CREATE TABLE IF NOT EXISTS google_accounts(sub TEXT PRIMARY KEY,customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id))');
db.exec('CREATE TABLE IF NOT EXISTS gallery(id TEXT PRIMARY KEY,title TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL)');
const currentOffer=()=>{const saved=row('SELECT value FROM settings WHERE key=?','homepage_offer');return saved?JSON.parse(saved.value):null;};
const sessions=new Map(),attempts=new Map();
const customerSessions=new Map(),customerAttempts=new Map();
const query=(s,...args)=>db.prepare(s).all(...args);
const row=(s,...args)=>db.prepare(s).get(...args);
const run=(s,...args)=>db.prepare(s).run(...args);
const configured=()=>!!row('SELECT value FROM settings WHERE key=?','password');
if(!configured()){
 const initialPassword=process.env.SALON_OWNER_PASSWORD_FILE?fs.readFileSync(process.env.SALON_OWNER_PASSWORD_FILE,'utf8').trimEnd():process.env.SALON_OWNER_PASSWORD;
 if(initialPassword){
  if(initialPassword.length<12||initialPassword.length>200)throw Error('Initial owner password must contain 12–200 characters.');
  const salt=randomBytes(16).toString('hex');run('INSERT INTO settings(key,value) VALUES(?,?)','password',salt+':'+scryptSync(initialPassword,salt,64).toString('hex'));
 }else if(production)throw Error('Set SALON_OWNER_PASSWORD_FILE or SALON_OWNER_PASSWORD before the first production start.');
}
const sessionCookie=(token,maxAge)=>`vinayak_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`;
const customerCookie=(token,maxAge)=>`vinayak_customer=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`;
function customerToken(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vinayak_customer='))?.slice('vinayak_customer='.length);}
function customerFor(req,required=false){const s=customerSessions.get(customerToken(req));if(!s||s.expires<Date.now()){if(required)fail(401,'Please sign in to your customer profile.');return null;}return row(`SELECT c.id,c.username,c.name,c.phone,c.email,c.created,CASE WHEN g.sub IS NOT NULL THEN 'google' ELSE 'password' END AS provider FROM customers c LEFT JOIN google_accounts g ON g.customer_id=c.id WHERE c.id=?`,s.id);}
function customerSession(res,customer){for(const [token,s] of customerSessions)if(s.expires<Date.now())customerSessions.delete(token);const token=randomBytes(32).toString('hex');customerSessions.set(token,{id:customer.id,expires:Date.now()+8*3600000});return json(res,200,{customer:{id:customer.id,username:customer.username,name:customer.name,phone:customer.phone,email:customer.email||'',provider:customer.provider||'password'}},{'Set-Cookie':customerCookie(token,28800)});}
function customerDetails(v){if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80||typeof v.phone!=='string'||!/^[+0-9 ()-]{7,25}$/.test(v.phone))fail(400,'Enter your name and a valid phone number.');}
function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
const missingCustomerHash=hashPassword(randomBytes(32).toString('hex'));
const instant=(date,time)=>new Date(`${date}T${time}:00+05:30`).getTime();
function fail(status,message){throw Object.assign(new Error(message),{status})}
function validateSlot(s){
 if(!services.some(x=>x.id===s.service))fail(400,'Choose a valid service.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date||'')||!/^\d{2}:\d{2}$/.test(s.start||'')||!/^\d{2}:\d{2}$/.test(s.end||''))fail(400,'Enter a valid date and time.');
 const a=instant(s.date,s.start),b=instant(s.date,s.end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||s.start<'07:30'||s.end>'21:30'||s.start>=s.end||a<=Date.now())fail(400,'Choose a future slot between 7:30 AM and 9:30 PM.');
 const iso=new Date(a+19800000).toISOString();if(iso.slice(0,10)!==s.date||iso.slice(11,16)!==s.start)fail(400,'Invalid calendar date or time.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end))fail(400,'Invalid end time.');
}
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Use a JSON request.');let text='';for await(const chunk of req){text+=chunk;if(text.length>16000)fail(413,'Request too large.')}let value;try{value=JSON.parse(text)}catch{fail(400,'Invalid request.')}if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Request must be a JSON object.');return value;}
function authorised(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vinayak_session='))?.slice(16);if(!token||!sessions.has(token)||sessions.get(token)<Date.now())fail(401,'Please sign in as the owner.');}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://accounts.google.com; worker-src 'self'; manifest-src 'self'; frame-src https://www.google.com https://accounts.google.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/healthz'&&req.method==='GET'){db.prepare('SELECT 1').get();return json(res,200,{status:'ok'});}
 if(u.pathname.startsWith('/api/')){
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==appOrigin)fail(403,'Please use the salon website to make this request.');
  if(u.pathname==='/api/status'&&req.method==='GET')return json(res,200,{configured:configured(),timezone:'Asia/Kolkata'});
  if(u.pathname==='/api/google-rating'&&req.method==='GET')return json(res,200,await getGoogleRating());
  if(u.pathname==='/api/offer'&&req.method==='GET'){const offer=currentOffer(),today=new Date(Date.now()+19800000).toISOString().slice(0,10);return json(res,200,{offer:offer?.published&&offer.expires>=today?offer:null});}
  if(u.pathname==='/api/gallery'&&req.method==='GET')return json(res,200,query('SELECT id,title,created FROM gallery WHERE published=1 ORDER BY created DESC').map(p=>({...p,url:'/media/gallery/'+p.id})));
  if(u.pathname==='/api/customer/google-config'&&req.method==='GET')return json(res,200,{clientId:googleClientId||null});
  if(u.pathname==='/api/customer/google-login'&&req.method==='POST'){
   if(!googleClientId)fail(503,'Google sign-in is not configured yet.');
   const v=await body(req);
   let identity;
   try{identity=await verifyGoogleIdToken(v.credential,googleClientId)}catch(error){fail(error.message.includes('temporarily unavailable')?503:401,error.message.includes('temporarily unavailable')?'Google sign-in is temporarily unavailable.':'Invalid Google credential.');}
   let customer=row('SELECT c.id,c.username,c.name,c.phone,c.email,c.created FROM google_accounts g JOIN customers c ON c.id=g.customer_id WHERE g.sub=?',identity.sub);
   if(!customer){
    const id=randomUUID(),username='g'+createHash('sha256').update(identity.sub).digest('hex').slice(0,38),name=identity.name||'Google customer';
    db.exec('BEGIN IMMEDIATE');try{
     if(row('SELECT id FROM customers WHERE username=?',username))fail(409,'This Google account could not be linked automatically. Please contact the salon.');
     run('INSERT INTO customers(id,username,name,phone,password,created,email) VALUES(?,?,?,?,?,?,?)',id,username,name,'',hashPassword(randomBytes(32).toString('hex')),new Date().toISOString(),identity.email);
     run('INSERT INTO google_accounts(sub,customer_id) VALUES(?,?)',identity.sub,id);
     db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    customer=row('SELECT id,username,name,phone,email,created FROM customers WHERE id=?',id);
   }else if(identity.email&&identity.email!==customer.email){run('UPDATE customers SET email=? WHERE id=?',identity.email,customer.id);customer.email=identity.email;}
   return customerSession(res,{...customer,provider:'google'});
  }
  if(u.pathname==='/api/customer/register'&&req.method==='POST'){
   const v=await body(req);customerDetails(v);const username=typeof v.username==='string'?v.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))fail(400,'Use a username of 3–40 letters, numbers, dots, hyphens or underscores.');
   if(typeof v.password!=='string'||v.password.length<12||v.password.length>200)fail(400,'Use a password of 12–200 characters.');
   if(row('SELECT id FROM customers WHERE username=?',username))fail(409,'This username is unavailable. Choose another.');
   const id=randomUUID();run('INSERT INTO customers(id,username,name,phone,password,created) VALUES(?,?,?,?,?,?)',id,username,v.name.trim(),v.phone.trim(),hashPassword(v.password),new Date().toISOString());return customerSession(res,{id,username,name:v.name.trim(),phone:v.phone.trim()});
  }
  if(u.pathname==='/api/customer/login'&&req.method==='POST'){
   const v=await body(req),username=typeof v.username==='string'?v.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username)||typeof v.password!=='string'||v.password.length>200)fail(401,'Incorrect username or password.');
   const key=username,attempt=customerAttempts.get(key);if(attempt?.until>Date.now())fail(429,'Too many attempts. Try again in 15 minutes.');
   const c=row('SELECT * FROM customers WHERE username=?',username);
   const [salt,hash]=(c?.password||missingCustomerHash).split(':');
   const valid=timingSafeEqual(scryptSync(v.password,salt,64),Buffer.from(hash,'hex'));
   if(!c||!valid){const count=attempt&&attempt.until>Date.now()-900000?attempt.count+1:1;customerAttempts.set(key,{count,until:count>=5?Date.now()+900000:Date.now()});fail(401,'Incorrect username or password.');}
   customerAttempts.delete(key);return customerSession(res,c);
  }
  if(u.pathname==='/api/customer/logout'&&req.method==='POST'){customerSessions.delete(customerToken(req));return json(res,200,{ok:true},{'Set-Cookie':customerCookie('',0)});}
  if(u.pathname==='/api/customer/profile'&&req.method==='GET'){const c=customerFor(req,true);return json(res,200,{customer:c});}
  if(u.pathname==='/api/customer/profile'&&req.method==='PUT'){const c=customerFor(req,true),v=await body(req);customerDetails(v);run('UPDATE customers SET name=?,phone=? WHERE id=?',v.name.trim(),v.phone.trim(),c.id);return json(res,200,{customer:row('SELECT id,username,name,phone,created FROM customers WHERE id=?',c.id)});}
  if(u.pathname==='/api/customer/bookings'&&req.method==='GET'){const c=customerFor(req,true);return json(res,200,query('SELECT b.id,b.name,b.status,b.created,s.service,s.date,s.start,s.end FROM bookings b JOIN slots s ON s.id=b.slot_id WHERE b.customer_id=? ORDER BY s.date DESC,s.start DESC',c.id));}
  if(u.pathname==='/api/login'&&req.method==='POST'){
   const v=await body(req),ip=req.socket.remoteAddress,attempt=attempts.get(ip)||{count:0,until:0};if(attempt.until>Date.now())fail(429,'Too many attempts. Try again in 15 minutes.');
   if(!configured()){
    if(production)fail(503,'Owner setup must be completed before launch.');
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))fail(403,'Initial owner setup must be completed locally.');
    if(typeof v.password!=='string'||v.password.length<12||v.password.length>200)fail(400,'Set an owner password of at least 12 characters.');
    const salt=randomBytes(16).toString('hex');run('INSERT INTO settings(key,value) VALUES(?,?)','password',salt+':'+scryptSync(v.password,salt,64).toString('hex'));
   }else{
    const [salt,hash]=row('SELECT value FROM settings WHERE key=?','password').value.split(':');
    if(typeof v.password!=='string'||v.password.length>200||!timingSafeEqual(scryptSync(v.password,salt,64),Buffer.from(hash,'hex'))){attempt.count++;if(attempt.count>=5)attempt.until=Date.now()+900000;attempts.set(ip,attempt);fail(401,'Incorrect owner password.');}
   }
   attempts.delete(ip);for(const [t,expiry] of sessions)if(expiry<Date.now())sessions.delete(t);const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie(token,28800)});
  }
  if(u.pathname==='/api/logout'&&req.method==='POST'){authorised(req);const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vinayak_session='))?.slice(16);sessions.delete(token);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie('',0)});}
  if(u.pathname.startsWith('/api/owner/')){
   authorised(req);
   if(u.pathname==='/api/owner/offer'&&req.method==='GET')return json(res,200,{offer:currentOffer()});
   if(u.pathname==='/api/owner/offer'&&req.method==='POST'){
    const v=await body(req);
    if(typeof v.title!=='string'||v.title.trim().length>100||typeof v.details!=='string'||v.details.trim().length>600||typeof v.expires!=='string'||typeof v.published!=='boolean')fail(400,'Enter a valid offer.');
    if(v.published&&(!v.title.trim()||!v.details.trim()||!v.expires))fail(400,'Add an offer title, details and expiry date before publishing.');
    if(v.expires&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.expires)||!Number.isFinite(Date.parse(v.expires+'T00:00:00Z'))||new Date(v.expires+'T00:00:00Z').toISOString().slice(0,10)!==v.expires))fail(400,'Enter a valid expiry date.');
    const offer={title:v.title.trim(),details:v.details.trim(),expires:v.expires,published:v.published};
    run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','homepage_offer',JSON.stringify(offer));return json(res,200,{offer});
   }

   if(u.pathname==='/api/owner/gallery'&&req.method==='GET')return json(res,200,query('SELECT id,title,published,created FROM gallery ORDER BY created DESC').map(p=>({...p,url:'/media/gallery/'+p.id})));
   if(u.pathname==='/api/owner/gallery'&&req.method==='POST'){
    const title=(u.searchParams.get('title')||'').trim();if(!title||title.length>120)fail(400,'Add a photo title of 1–120 characters.');
    if(row('SELECT count(*) AS n FROM gallery').n>=60)fail(400,'The gallery limit is 60 photos.');
    const type=req.headers['content-type']?.split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))fail(415,'Use a JPG, PNG or WebP photo.');
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)fail(413,'Choose a photo smaller than 5 MB.');chunks.push(chunk);}const data=Buffer.concat(chunks);
    const valid=type==='image/jpeg'?data.length>3&&data[0]===255&&data[1]===216&&data[2]===255:type==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
    if(!valid)fail(400,'This file is not a supported image.');
    const id=randomUUID(),ext=type==='image/jpeg'?'jpg':type==='image/png'?'png':'webp',filename=id+'.'+ext,dir=path.join(dataDir,'gallery');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,filename);fs.writeFileSync(target,data,{flag:'wx'});
    try{run('INSERT INTO gallery(id,title,filename,mime,created) VALUES(?,?,?,?,?)',id,title,filename,type,new Date().toISOString());}catch(e){fs.unlinkSync(target);throw e;}return json(res,201,{id,title,url:'/media/gallery/'+id});
   }
   if(u.pathname==='/api/owner/gallery'&&req.method==='PATCH'){const v=await body(req);if(typeof v.id!=='string'||typeof v.published!=='boolean')fail(400,'Choose a photo and visibility.');if(!row('SELECT id FROM gallery WHERE id=?',v.id))fail(404,'Photo not found.');run('UPDATE gallery SET published=? WHERE id=?',v.published?1:0,v.id);return json(res,200,{ok:true});}
   if(u.pathname==='/api/owner/slots'&&req.method==='GET')return json(res,200,query(`SELECT s.*,b.id AS booking_id FROM slots s LEFT JOIN bookings b ON b.slot_id=s.id AND b.status='confirmed' ORDER BY s.date,s.start`));
   if(u.pathname==='/api/owner/slots'&&req.method==='POST'){
    const s=await body(req);validateSlot(s);db.exec('BEGIN IMMEDIATE');try{
     if(row('SELECT id FROM slots WHERE date=? AND start<? AND end>?',s.date,s.end,s.start))fail(409,'This slot overlaps another appointment slot.');
     s.id=randomUUID();run('INSERT INTO slots VALUES(?,?,?,?,?)',s.id,s.service,s.date,s.start,s.end);db.exec('COMMIT');return json(res,201,s);
    }catch(e){db.exec('ROLLBACK');throw e;}
   }
   if(u.pathname==='/api/owner/slots'&&req.method==='DELETE'){const v=await body(req);if(row('SELECT id FROM bookings WHERE slot_id=?',v.id))fail(409,'This slot has a booking record and cannot be deleted.');run('DELETE FROM slots WHERE id=?',v.id);return json(res,200,{ok:true});}
   if(u.pathname==='/api/owner/bookings'&&req.method==='GET')return json(res,200,query(`SELECT b.*,s.service,s.date,s.start,s.end FROM bookings b JOIN slots s ON s.id=b.slot_id ORDER BY s.date,s.start`));
   if(u.pathname==='/api/owner/cancel'&&req.method==='POST'){const v=await body(req);run("UPDATE bookings SET status='cancelled' WHERE id=?",v.id);return json(res,200,{ok:true});}
  }
  if(u.pathname==='/api/slots'&&req.method==='GET'){
   const list=query(`SELECT s.id,s.date,s.start,s.end,s.service FROM slots s WHERE s.service=? AND s.date=? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status='confirmed') ORDER BY s.start`,u.searchParams.get('service'),u.searchParams.get('date')).filter(s=>s.start>='07:30'&&s.end<='21:30'&&instant(s.date,s.start)>Date.now());return json(res,200,list);
  }
  if(u.pathname==='/api/bookings'&&req.method==='POST'){
   const customer=customerFor(req,true);
   const v=await body(req);if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80||typeof v.phone!=='string'||!/^[+0-9 ()-]{7,25}$/.test(v.phone)||typeof v.notes!=='string'||v.notes.length>500)fail(400,'Enter a name, valid phone number and notes under 500 characters.');
   if(v.email!==undefined&&typeof v.email!=='string')fail(400,'Enter a valid email address.');
   const email=v.email===undefined?customer.email||'':v.email.trim().toLowerCase();
   if(email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(v.whatsappOptIn!==undefined&&typeof v.whatsappOptIn!=='boolean'))fail(400,'Enter a valid email address and notification preference.');
   if(!configured())fail(503,'The owner has not opened bookings yet.');
   let booking;db.exec('BEGIN IMMEDIATE');try{
    const s=row('SELECT * FROM slots WHERE id=?',v.slot);if(!s||s.start<'07:30'||s.end>'21:30'||instant(s.date,s.start)<=Date.now())fail(409,'This appointment is no longer available.');
    if(row("SELECT id FROM bookings WHERE slot_id=? AND status='confirmed'",s.id))fail(409,'That slot was just booked. Please choose another.');
    const id=randomUUID();run('INSERT INTO bookings(id,slot_id,name,phone,notes,created,customer_id,email) VALUES(?,?,?,?,?,?,?,?)',id,s.id,v.name.trim(),v.phone.trim(),v.notes,new Date().toISOString(),customer.id,email);db.exec('COMMIT');booking={...s,id,name:v.name.trim(),phone:v.phone.trim(),notes:v.notes,slot_id:s.id,reference:id};
   }catch(e){db.exec('ROLLBACK');throw e;}
   const notification=await sendBookingNotifications({...booking,service:services.find(s=>s.id===booking.service).name},{email,whatsappOptIn:v.whatsappOptIn===true});
   return json(res,201,{...booking,locationUrl:salonMapsUrl,notification});
  }
  fail(404,'Not found.');
 }
 if(u.pathname.startsWith('/media/gallery/')&&req.method==='GET'){const id=u.pathname.slice('/media/gallery/'.length);if(!/^[a-f0-9-]{36}$/.test(id))fail(404,'Photo not found.');const p=row('SELECT * FROM gallery WHERE id=?',id);if(!p)fail(404,'Photo not found.');if(!p.published)authorised(req);const file=path.join(dataDir,'gallery',path.basename(p.filename));if(!fs.existsSync(file))fail(404,'Photo not found.');res.writeHead(200,{'Content-Type':p.mime,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
 const files={'/':'index.html','/index.html':'index.html','/logo.jpg':'logo.jpg','/booking.mjs':'booking.mjs','/services.mjs':'services.mjs','/salon-info.mjs':'salon-info.mjs','/owner.html':'owner.html','/owner.mjs':'owner.mjs','/profile.html':'profile.html','/profile.mjs':'profile.mjs','/gallery.html':'gallery.html','/gallery.mjs':'gallery.mjs','/home-gallery.mjs':'home-gallery.mjs','/home-content.mjs':'home-content.mjs','/owner-offer.mjs':'owner-offer.mjs','/google-login.mjs':'google-login.mjs','/rating.mjs':'rating.mjs','/site-info.html':'site-info.html','/owner-gallery.mjs':'owner-gallery.mjs'};
 for(const name of ['manifest.webmanifest','sw.js','app.mjs','app.css','install.html','offline.html','app-icon-180.png','app-icon-192.png','app-icon-512.png'])files['/'+name]=name;
 if(u.pathname==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
 const file=files[u.pathname];if(!file||!['GET','HEAD'].includes(req.method))fail(404,'Not found.');
 const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(path.join(root,file)).pipe(res);
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}});
server.requestTimeout=20000;server.headersTimeout=15000;
server.listen(port,host,()=>console.log(`Vinayak website: ${appOrigin}\nOwner dashboard: ${appOrigin}/owner.html\nListening on ${host}:${port}`));
let closing=false;function shutdown(){if(closing)return;closing=true;server.close(()=>{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
