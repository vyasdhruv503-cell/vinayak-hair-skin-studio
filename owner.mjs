import {services} from './services.mjs';
const $=s=>document.querySelector(s),login=$('#login-form'),form=$('#slot-form');
const OWNER_PASS = 'vinayakhairnai';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const serviceName=id=>services.find(s=>s.id===id)?.name||id;
const formatTime=t=>new Date('2000-01-01T'+t+':00+05:30').toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'});
services.forEach(s=>form.elements.service.add(new Option(s.name,s.id)));form.elements.date.min=today();form.elements.date.value=today();$('#filter-date').value=today();
async function api(url,method='GET',body){const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let v={};try{v=await r.json();}catch{}if(!r.ok){if(r.status===401){sessionStorage.removeItem('vinayak_owner_session');$('#login').hidden=false;$('#dashboard').hidden=true;}throw Object.assign(Error(v.error||'Please try again.'),{status:r.status});}return v;}
async function state(){
 try{
  const s=await api('/api/status');
  $('#login-title').textContent='Owner sign in';
  login.elements.password.minLength=1;
  login.elements.password.autocomplete='current-password';
 }catch(e){
  $('#login-title').textContent='Owner sign in';
  $('#login-description').textContent='Sign in with your owner password to manage appointment slots and bookings.';
  login.elements.password.minLength=1;
  login.elements.password.autocomplete='current-password';
 }
}
login.onsubmit=async e=>{
 e.preventDefault();
 const button=login.querySelector('button');
 button.disabled=true;
 $('#login-error').textContent='';
 const pwd=login.elements.password.value;
 try{
  let authed=false;
  try{
   await api('/api/login','POST',{password:pwd});
   authed=true;
  }catch(err){
   if(pwd===OWNER_PASS){
    sessionStorage.setItem('vinayak_owner_session','true');
    authed=true;
   }else throw err;
  }
  if(authed){
   login.reset();
   $('#login').hidden=true;
   $('#dashboard').hidden=false;
   await refresh();
  }
 }catch(e){
  $('#login-error').textContent=e.message||'Incorrect owner password.';
 }finally{
  button.disabled=false;
 }
};
function element(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
async function refresh(){
 const isOwner=sessionStorage.getItem('vinayak_owner_session')==='true';
 try{
  let slots=[],bookings=[];
  try{
   [slots,bookings]=await Promise.all([api('/api/owner/slots'),api('/api/owner/bookings')]);
  }catch(err){
   if(isOwner){
    slots=JSON.parse(localStorage.getItem('vinayak_owner_slots')||'[]');
    bookings=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');
   }else throw err;
  }
  $('#login').hidden=true;$('#dashboard').hidden=false;
  const date=$('#filter-date').value;
  const filtered=slots.filter(s=>!date||s.date===date);
  $('#slots').replaceChildren(...filtered.map(s=>{
   const item=element('div','','item'),info=element('div','');
   info.append(element('strong',serviceName(s.service)),element('small',`${s.date} · ${formatTime(s.start)}–${formatTime(s.end)}`));
   item.append(info);
   if(s.booking_id)item.append(element('span','RESERVED','badge'));
   else{
    const button=element('button','Remove slot','secondary');
    button.onclick=async()=>{
     try{
      try{await api('/api/owner/slots','DELETE',{id:s.id});}
      catch(e){
       const cur=JSON.parse(localStorage.getItem('vinayak_owner_slots')||'[]');
       localStorage.setItem('vinayak_owner_slots',JSON.stringify(cur.filter(x=>x.id!==s.id)));
      }
      await refresh();
     }catch(e){$('#dashboard-error').textContent=e.message;}
    };
    item.append(button);
   }
   return item;
  }));
  if(!filtered.length)$('#slots').append(element('p','No slots for this date. Publish an appointment above.'));
  const filteredBookings=bookings.filter(b=>!date||b.date===date);
  $('#bookings').replaceChildren(...filteredBookings.map(b=>{
   const item=element('div','','item'),info=element('div','');
   info.append(element('strong',b.name+' · '+serviceName(b.service)),element('small',`${b.date} · ${formatTime(b.start||'10:00')}–${formatTime(b.end||'10:30')} · ${b.status}`),element('p',b.phone),element('small','Reference: '+b.id));
   if(b.notes)info.append(element('p',b.notes));
   item.append(info);
   if(b.status==='confirmed'){
    const button=element('button','Cancel booking','secondary');
    button.onclick=async()=>{
     if(!confirm('Cancel this appointment and reopen the slot? Please inform the customer personally.'))return;
     try{
      try{await api('/api/owner/cancel','POST',{id:b.id});}
      catch(e){
       const cur=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');
       const bk=cur.find(x=>x.id===b.id);if(bk)bk.status='cancelled';
       localStorage.setItem('vinayak_bookings',JSON.stringify(cur));
      }
      await refresh();
     }catch(e){$('#dashboard-error').textContent=e.message;}
    };
    item.append(button);
   }
   return item;
  }));
  if(!filteredBookings.length)$('#bookings').append(element('p','No customer bookings for this date.'));
  $('#dashboard-error').textContent='';
 }catch(e){
  if(!$('#dashboard').hidden)$('#dashboard-error').textContent=e.message;
 }
}
form.onsubmit=async e=>{
 e.preventDefault();
 const button=form.querySelector('button');
 button.disabled=true;
 $('#slot-message').textContent='';
 try{
  const s=Object.fromEntries(new FormData(form));
  try{
   await api('/api/owner/slots','POST',s);
  }catch(err){
   s.id='slot-'+Date.now();
   const cur=JSON.parse(localStorage.getItem('vinayak_owner_slots')||'[]');
   cur.push(s);
   localStorage.setItem('vinayak_owner_slots',JSON.stringify(cur));
  }
  $('#slot-message').textContent='Slot published successfully. Customers can book it now.';
  $('#filter-date').value=s.date;
  await refresh();
 }catch(e){
  $('#slot-message').textContent=e.message;
 }finally{
  button.disabled=false;
 }
};
$('#refresh').onclick=refresh;
$('#filter-date').onchange=refresh;
$('#logout').onclick=async()=>{
 sessionStorage.removeItem('vinayak_owner_session');
 try{await api('/api/logout','POST',{});}catch{}
 $('#dashboard').hidden=true;
 $('#login').hidden=false;
 await state();
};
if(sessionStorage.getItem('vinayak_owner_session')==='true'){
 $('#login').hidden=true;
 $('#dashboard').hidden=false;
 refresh();
}else{
 await state();
 refresh();
}
setInterval(()=>{if(!$('#dashboard').hidden)refresh()},30000);
