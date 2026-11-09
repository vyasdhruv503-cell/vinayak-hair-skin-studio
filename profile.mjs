import {services} from './services.mjs';
import {salonMapsUrl} from './salon-info.mjs';
const $=s=>document.querySelector(s),auth=$('#auth-form'),edit=$('#edit-form');let mode='login',customer=null,bookings=[],filter='upcoming';
const bookingIntent=new URLSearchParams(location.search);
if(bookingIntent.get('booking')==='1'){$('#booking-signin-note').hidden=false;$('#auth-submit').textContent='Sign in & continue ↗';}
function resumeBooking(){if(bookingIntent.get('booking')!=='1')return false;const next=new URLSearchParams({resumeBooking:'1'});for(const key of ['service','date','slot'])if(bookingIntent.get(key))next.set(key,bookingIntent.get(key));location.replace('/?'+next+'#appointment');return true;}
async function api(url,method='GET',body){const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let v={};try{v=await r.json();}catch{}if(!r.ok)throw Object.assign(Error(v.error||'Please try again.'),{status:r.status});return v;}
function profileIntro(signedIn){document.body.classList.toggle('is-signed-in',signedIn);$('.intro .eyebrow').textContent=signedIn?'YOUR VINAYAK ACCOUNT':'CUSTOMER PROFILE';$('.intro h1').textContent=signedIn?'My profile':'Your space at Vinayak.';$('.intro p').textContent=signedIn?'Your details, your appointments. All in one place.':'Sign in to manage your details and appointments.';}
function passwordVisibility(show){auth.elements.password.type=show?'text':'password';$('#password-toggle').textContent=show?'Hide':'Show';$('#password-toggle').setAttribute('aria-pressed',String(show));$('#password-toggle').setAttribute('aria-label',show?'Hide password':'Show password');}
$('#password-toggle').onclick=()=>passwordVisibility(auth.elements.password.type==='password');
function accountMode(next){mode=next;$('#auth-error').textContent='';const register=mode==='register';$('#register-fields').hidden=!register;auth.elements.name.disabled=!register;auth.elements.phone.disabled=!register;auth.elements.name.required=register;auth.elements.phone.required=register;auth.elements.password.minLength=register?12:1;auth.elements.password.autocomplete=register?'new-password':'current-password';$('#password-tip').hidden=!register;$('#auth-title').textContent=register?'A profile, just for you.':'Welcome back.';$('#auth-submit').textContent=bookingIntent.get('booking')==='1'?(register?'Create profile & continue ↗':'Sign in & continue ↗'):(register?'Create my profile ↗':'Sign in to your profile ↗');$('#login-tab').setAttribute('aria-selected',String(!register));$('#register-tab').setAttribute('aria-selected',String(register));}
$('#login-tab').onclick=()=>{accountMode('login');$('#username-tip').hidden=true;passwordVisibility(false)};$('#register-tab').onclick=()=>{accountMode('register');$('#username-tip').hidden=false;passwordVisibility(false)};
auth.onsubmit=async e=>{e.preventDefault();$('#auth-error').textContent='';$('#auth-submit').disabled=true;try{const data=Object.fromEntries(new FormData(auth));await api('/api/customer/'+mode,'POST',data);auth.reset();await load();}catch(e){$('#auth-error').textContent=e.message;}finally{$('#auth-submit').disabled=false}};
function showCustomer(){profileIntro(true);const initials=customer.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();$('#avatar').textContent=initials;$('#customer-name').textContent=customer.name;$('#customer-username').textContent=customer.provider==='google'?'Google account':'@'+customer.username;$('#customer-phone').textContent=customer.phone||'No phone number added';const phoneRow=$('#customer-phone')?.closest('.contact-row');if(phoneRow)phoneRow.hidden=false;if(customer.email){const em=$('#customer-email');if(em){em.textContent=customer.email;const er=$('#email-row');if(er)er.hidden=false;}}$('#customer-since').textContent='Member since '+new Date(customer.created).toLocaleDateString('en-IN',{year:'numeric',month:'long',timeZone:'Asia/Kolkata'});}
function make(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
const endTime=b=>new Date(`${b.date}T${b.end}:00+05:30`).getTime();
const upcoming=b=>b.status==='confirmed'&&endTime(b)>Date.now();
function render(){
 const total=bookings.length,next=bookings.filter(upcoming).length,past=bookings.filter(b=>b.status==='confirmed'&&!upcoming(b)).length;
 $('#booking-stats').replaceChildren(...[[next,'Upcoming'],[past,'Past bookings'],[total,'Total bookings']].map(([value,label])=>{const metric=make('div','','metric');metric.append(make('strong',String(value)),make('span',label));return metric}));
 const list=bookings.filter(b=>filter==='all'||(filter==='upcoming'?upcoming(b):!upcoming(b))).sort((a,b)=>filter==='upcoming'?endTime(a)-endTime(b):endTime(b)-endTime(a));
 const area=$('#appointments');area.replaceChildren();
 if(!list.length){const empty=make('div','','empty'),icon=make('div','','empty-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M8 16h5"/></svg>';empty.append(icon,make('h3',filter==='upcoming'?'A little time for you.':'No appointments here yet.'),make('p',total?'Choose another tab to see your other appointments.':'Your next salon visit starts here. Choose a service and find a time that suits you.'));const link=make('a','Book an appointment ↗','button');link.href='/#appointment';empty.append(link);area.append(empty);return;}
 for(const b of list){
  const article=make('article','','appointment'),row=make('div','','row'),isNext=upcoming(b),cancelled=b.status==='cancelled';row.append(make('h3',services.find(s=>s.id===b.service)?.name||b.service),make('span',cancelled?'Cancelled':isNext?'Upcoming':'Past','badge'+(cancelled?' cancelled':isNext?'':' past')));
  const d=new Date(b.date+'T12:00:00+05:30'),date=d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}),time=t=>new Date(b.date+'T'+t+':00+05:30').toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'});
  const when=make('div','','appointment-when'),tile=make('div','','date-tile'),info=make('div','');tile.setAttribute('aria-hidden','true');tile.append(make('strong',String(Number(b.date.slice(8)))),make('span',d.toLocaleDateString('en-IN',{month:'short',timeZone:'Asia/Kolkata'})));info.append(make('p',date),make('p',`${time(b.start)} – ${time(b.end)} IST`,'time'));when.append(tile,info);
  const details=make('details','');details.append(make('summary','Booking details'),make('p','With the salon owner · Booked for '+b.name),make('small','Reference: '+b.id));if(!cancelled){const location=make('a','Open salon location in Google Maps ↗','button subtle');location.href=salonMapsUrl;location.target='_blank';location.rel='noopener noreferrer';location.style.marginTop='14px';details.append(location);}article.append(row,when,details);area.append(article);
 }
}
async function load(){
 try{
  const v=await api('/api/customer/profile');
  customer=v.customer;
  if(resumeBooking())return;
  $('#auth').hidden=true;$('#dashboard').hidden=false;showCustomer();$('#appointments').textContent='Loading your appointments…';$('#booking-stats').replaceChildren();
  try{bookings=await api('/api/customer/bookings');}catch{bookings=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');}
  render();$('#profile-error').textContent='';
 }catch(e){
  const local=localStorage.getItem('vinayak_customer');
  if(local){
   try{
    customer=JSON.parse(local);
    if(resumeBooking())return;
    $('#auth').hidden=true;$('#dashboard').hidden=false;showCustomer();
    bookings=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');
    render();
    return;
   }catch{}
  }
  if(e.status===401||e.status===404){customer=null;bookings=[];profileIntro(false);$('#auth').hidden=false;$('#dashboard').hidden=true;$('#edit-panel').hidden=true;}
  else if(customer)$('#profile-error').textContent=e.message;
  else $('#auth-error').textContent='Could not load your profile. Please try again.';
 }
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});
$('#edit-profile').onclick=()=>{edit.elements.name.value=customer.name;edit.elements.phone.value=customer.phone||'';$('#edit-message').textContent='';$('#edit-panel').hidden=false;edit.elements.name.focus()};$('#cancel-edit').onclick=()=>{$('#edit-panel').hidden=true};
edit.onsubmit=async e=>{
 e.preventDefault();const b=edit.querySelector('button');b.disabled=true;
 try{
  try{
   customer=(await api('/api/customer/profile','PUT',Object.fromEntries(new FormData(edit)))).customer;
  }catch(err){
   if(customer){
    customer.name=edit.elements.name.value.trim();
    customer.phone=edit.elements.phone.value.trim();
    localStorage.setItem('vinayak_customer',JSON.stringify(customer));
   }else throw err;
  }
  showCustomer();$('#edit-message').textContent='Your details have been saved.';
 }catch(e){$('#edit-message').textContent=e.message;}
 finally{b.disabled=false}
};
$('#logout').onclick=async()=>{
 localStorage.removeItem('vinayak_customer');
 try{await api('/api/customer/logout','POST',{});}catch{}
 customer=null;bookings=[];profileIntro(false);passwordVisibility(false);$('#username-tip').hidden=true;$('#edit-panel').hidden=true;$('#dashboard').hidden=true;$('#auth').hidden=false;accountMode('login');
};
$('#refresh').onclick=load;await load();
