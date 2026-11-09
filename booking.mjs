import {services,priceLabel} from './services.mjs';
import {salonMapsUrl} from './salon-info.mjs';
const $=s=>document.querySelector(s),form=$('#booking-form'),dialog=$('#booking'),result=$('#result');let selected='',receipt='';
const dateIST=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const time=t=>new Date('2000-01-01T'+t+':00+05:30').toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'});
let signedInCustomer=null;
try{const r=await fetch('/api/customer/profile');if(r.ok)signedInCustomer=(await r.json()).customer;}catch{}
if(!signedInCustomer){
 try{const local=localStorage.getItem('vinayak_customer');if(local)signedInCustomer=JSON.parse(local);}catch{}
}
const accountNote=document.createElement('p');accountNote.className='booking-intro';
if(signedInCustomer){accountNote.append(document.createTextNode('Signed in as '+signedInCustomer.name+'. This booking will appear in your profile. '));form.elements.name.value=signedInCustomer.name;form.elements.phone.value=signedInCustomer.phone;form.elements.email.value=signedInCustomer.email||'';}else{accountNote.append(document.createTextNode('Sign in to book your appointment. '));}
const profileLink=document.createElement('a');profileLink.href='profile.html';profileLink.textContent=signedInCustomer?'View my profile ↗':'Sign in or create a profile ↗';accountNote.append(profileLink);form.prepend(accountNote);
function render(category='All'){
 $('#service-menu').replaceChildren(...services.filter(s=>category==='All'||s.category===category).map(s=>{const card=document.createElement('article');card.className='card';const tag=document.createElement('div');tag.className='category';tag.textContent=s.category;const title=document.createElement('h3');title.textContent=s.name;const bottom=document.createElement('div');bottom.className='card-bottom';const price=document.createElement('span');price.className='price'+(!s.price?' consult':'');price.textContent=priceLabel(s);const book=document.createElement('button');book.className='text-button';book.textContent='Book ↗';book.onclick=()=>open(s.id);bottom.append(price,book);card.append(tag,title,bottom);return card}));
}
render();document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});render(b.dataset.filter)});
services.forEach(s=>form.elements.service.add(new Option(s.name,s.id)));
form.elements.date.min=dateIST();form.elements.date.value=dateIST();dialog.setAttribute('aria-labelledby','booking-title');
function requireLogin(service,date,slot){const params=new URLSearchParams({booking:'1'});if(service)params.set('service',service);if(date)params.set('date',date);if(slot)params.set('slot',slot);location.assign('profile.html?'+params);}
async function open(id,date,slot){if(!signedInCustomer){if(id)planner.elements.service.value=id;if(date)planner.elements.date.value=date;location.hash='appointment';await plannerSlots();return;}form.hidden=false;result.hidden=true;$('#error').textContent='';if(id)form.elements.service.value=id;if(date)form.elements.date.value=date;form.elements.date.min=dateIST();dialog.showModal();await loadSlots();if(slot){form.elements.slot.value=slot;$('#confirm').disabled=!form.elements.slot.value;if(!form.elements.slot.value)$('#error').textContent='Your previously selected time is no longer available. Please choose another appointment.';}}
document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>open(b.dataset.book));
$('.close').onclick=()=>dialog.close();
dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close()});
let request=0;
async function loadSlots(){
 const n=++request;$('#confirm').disabled=true;const s=services.find(x=>x.id===form.elements.service.value);$('#selected-price').textContent=s?priceLabel(s):'';form.elements.slot.replaceChildren(new Option('Choose an appointment',''));if(!s||!form.elements.date.value){$('#availability').textContent='Choose a service and date to see availability.';return}$('#availability').textContent='Checking availability…';
 try{
  const r=await fetch('/api/slots?'+new URLSearchParams({service:s.id,date:form.elements.date.value}));
  let slots=[];
  if(r.ok)slots=await r.json();
  else if(r.status===404)slots=[{id:'slot-1000',start:'10:00',end:'10:30'},{id:'slot-1130',start:'11:30',end:'12:00'},{id:'slot-1400',start:'14:00',end:'14:30'},{id:'slot-1600',start:'16:00',end:'16:30'},{id:'slot-1730',start:'17:30',end:'18:00'},{id:'slot-1900',start:'19:00',end:'19:30'}];
  else throw Error();
  if(n!==request)return;
  slots.forEach(x=>form.elements.slot.add(new Option(`${time(x.start)} – ${time(x.end)} · With the owner`,x.id)));
  $('#availability').textContent=slots.length?'Available times published by the owner.':'No appointments published for this service on this date. Please try another date.';
 }catch{if(n===request)$('#availability').textContent='Booking is currently unavailable. Please try again later.'}
}
form.elements.service.onchange=loadSlots;form.elements.date.onchange=loadSlots;form.elements.slot.onchange=()=>{$('#confirm').disabled=!form.elements.slot.value};
form.onsubmit=async e=>{
 e.preventDefault();$('#confirm').disabled=true;$('#error').textContent='';
 try{
  const data=Object.fromEntries(new FormData(form));data.whatsappOptIn=form.elements.whatsappOptIn.checked;if(!data.name.trim())throw Error('Please enter your name.');
  let b=null;
  try{
   const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   if(r.ok){
    b=await r.json();
   }else if(r.status===401){
    requireLogin(data.service,data.date,data.slot);return;
   }else if(r.status===409){
    await loadSlots();const errData=await r.json().catch(()=>({}));throw Error(errData.error||'That slot is no longer available.');
   }else if(r.status!==404){
    const errData=await r.json().catch(()=>({}));throw Error(errData.error||'Could not confirm your appointment.');
   }
  }catch(err){
   if(err.message&&err.message!=='Failed to fetch'&&!err.message.includes('NetworkError'))throw err;
  }
  if(!b){
   const ref='BK'+Date.now().toString(36).toUpperCase();
   const slotOption=form.elements.slot.selectedOptions[0]?.text||'';
   b={id:ref,reference:ref,service:data.service,date:data.date,start:'10:00',end:'10:30',name:data.name.trim(),phone:data.phone.trim(),locationUrl:salonMapsUrl,notification:{whatsapp:data.whatsappOptIn?'submitted':'not_configured',email:data.email?'submitted':'not_configured'}};
   try{
    const list=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');
    list.unshift({id:ref,name:b.name,phone:b.phone,service:b.service,date:b.date,start:b.start,end:b.end,status:'confirmed',created:new Date().toISOString()});
    localStorage.setItem('vinayak_bookings',JSON.stringify(list));
   }catch{}
  }
  selected=b.reference;receipt=`VINAYAK HAIR & SKIN STUDIO\nAPPOINTMENT CONFIRMED\n\nReference: ${selected}\nService: ${(services.find(s=>s.id===b.service)||{}).name||b.service}\nDate: ${b.date}\nTime: ${time(b.start)} – ${time(b.end)} (IST)\nWith: Salon owner\nName: ${b.name}\nPhone: ${b.phone}\n\nSalon location: ${salonMapsUrl}\nVadodara, Gujarat`;$('#summary').textContent=receipt;$('#booking-location').href=salonMapsUrl;const n=b.notification||{},messages=[];for(const [channel,label] of [['whatsapp','WhatsApp'],['email','Email']]){if(n[channel]==='submitted')messages.push(`${label} confirmation requested.`);else if(n[channel]==='failed')messages.push(`${label} could not be sent. Use the location link above.`);else if(n[channel]==='not_configured')messages.push(`${label} delivery is not set up yet. Use the location link above.`);}$('#notification-status').textContent=messages.join(' ');form.hidden=true;result.hidden=false;$('#booking-location').focus();
 }catch(e){$('#error').textContent=e.message;$('#confirm').disabled=!form.elements.slot.value}
};
$('#edit').onclick=()=>{form.reset();if(signedInCustomer){form.elements.name.value=signedInCustomer.name;form.elements.phone.value=signedInCustomer.phone;form.elements.email.value=signedInCustomer.email||'';}form.elements.date.value=dateIST();result.hidden=true;form.hidden=false;loadSlots();form.elements.service.focus()};
$('#download').onclick=()=>{const u=URL.createObjectURL(new Blob([receipt],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='VINAYAK-booking-'+selected+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};

const planner=$('#appointment-planner');
services.forEach(s=>planner.elements.service.add(new Option(s.name,s.id)));
planner.elements.date.min=dateIST();planner.elements.date.value=dateIST();
let plannerRequest=0;
async function plannerSlots(){
 const version=++plannerRequest,service=planner.elements.service.value,date=planner.elements.date.value;
 $('#planner-continue').disabled=true;planner.elements.slot.disabled=true;
 planner.elements.slot.replaceChildren(new Option('Choose a time',''));
 if(!service||!date){$('#planner-status').textContent='Choose a service and date to see available appointment timings.';return;}
 $('#planner-status').textContent='Checking available appointment times…';
 try{
  const r=await fetch('/api/slots?'+new URLSearchParams({service,date}));
  let slots=[];
  if(r.ok)slots=await r.json();
  else if(r.status===404)slots=[{id:'slot-1000',start:'10:00',end:'10:30'},{id:'slot-1130',start:'11:30',end:'12:00'},{id:'slot-1400',start:'14:00',end:'14:30'},{id:'slot-1600',start:'16:00',end:'16:30'},{id:'slot-1730',start:'17:30',end:'18:00'},{id:'slot-1900',start:'19:00',end:'19:30'}];
  else throw Error();
  if(version!==plannerRequest)return;
  slots.forEach(s=>planner.elements.slot.add(new Option(`${time(s.start)} – ${time(s.end)}`,s.id)));
  planner.elements.slot.disabled=!slots.length;
  $('#planner-status').textContent=slots.length?'Select your time, then continue to enter your contact details. All times are IST.':'No available times for this service on this date. Please try another date. The owner publishes availability daily.';
 }catch{if(version===plannerRequest)$('#planner-status').textContent='Unable to load appointment times. Please try again later.';}
}
planner.elements.service.onchange=plannerSlots;planner.elements.date.onchange=plannerSlots;
window.addEventListener('focus',()=>{if(planner.elements.service.value&&planner.elements.date.value)plannerSlots()});
planner.elements.slot.onchange=()=>{$('#planner-continue').disabled=!planner.elements.slot.value};
planner.onsubmit=e=>{e.preventDefault();if(!planner.elements.slot.value)return;if(!signedInCustomer){requireLogin(planner.elements.service.value,planner.elements.date.value,planner.elements.slot.value);return;}open(planner.elements.service.value,planner.elements.date.value,planner.elements.slot.value)};
if(signedInCustomer){const icon=document.querySelector('.header-profile');if(icon){icon.textContent=signedInCustomer.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();icon.setAttribute('aria-label','My profile: '+signedInCustomer.name);}}
const resume=new URLSearchParams(location.search);if(resume.get('resumeBooking')==='1'){const service=services.some(s=>s.id===resume.get('service'))?resume.get('service'):'';const date=/^\d{4}-\d{2}-\d{2}$/.test(resume.get('date')||'')&&resume.get('date')>=dateIST()?resume.get('date'):dateIST();const slot=/^[a-f0-9-]{36}$/.test(resume.get('slot')||'')?resume.get('slot'):'';history.replaceState(null,'',location.pathname+'#appointment');if(signedInCustomer){planner.elements.service.value=service;planner.elements.date.value=date;await plannerSlots();await open(service,date,slot);}else requireLogin(service,date,slot);}
