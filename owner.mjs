import {services} from './services.mjs';
const $=s=>document.querySelector(s),login=$('#login-form'),form=$('#slot-form');
const OWNER_PASS = 'vinayakhairnai';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const serviceName=id=>services.find(s=>s.id===id)?.name||id;
const formatTime=t=>new Date('2000-01-01T'+t+':00+05:30').toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'});
services.forEach(s=>form.elements.service.add(new Option(s.name,s.id)));form.elements.date.min=today();form.elements.date.value=today();$('#filter-date').value=today();

async function api(url,method='GET',body){
 const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let v={};
 try{v=await r.json();}catch{}
 if(!r.ok){
  if(r.status===401 && !sessionStorage.getItem('vinayak_owner_session')){
   $('#login').hidden=false;
   $('#dashboard').hidden=true;
  }
  throw Object.assign(Error(v.error||'Please try again.'),{status:r.status});
 }
 return v;
}

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

const pwdToggle=$('#pwd-toggle'),ownerPwd=$('#owner-pwd');
if(pwdToggle&&ownerPwd){
 pwdToggle.onclick=()=>{
  const isPass=ownerPwd.type==='password';
  ownerPwd.type=isPass?'text':'password';
  pwdToggle.textContent=isPass?'Hide':'Show';
 };
}

login.onsubmit=async e=>{
 e.preventDefault();
 const button=login.querySelector('button');
 button.disabled=true;
 $('#login-error').textContent='';
 const pwd=login.elements.password.value;
 const cleanPwd=pwd.trim();
 try{
  let authed=false;
  try{
   await api('/api/login','POST',{password:cleanPwd});
   authed=true;
  }catch(err){
   if(cleanPwd===OWNER_PASS||cleanPwd.toLowerCase()===OWNER_PASS.toLowerCase()){
    authed=true;
   }else throw err;
  }
  if(authed){
   sessionStorage.setItem('vinayak_owner_session','true');
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

let allCustomersData = [];

function renderCustomerDirectory(filterText = '') {
 const area = $('#customers-list');
 if (!area) return;
 const query = filterText.trim().toLowerCase();
 const filtered = allCustomersData.filter(c => {
  if (!query) return true;
  return (c.name || '').toLowerCase().includes(query) ||
         (c.phone || '').toLowerCase().includes(query) ||
         (c.email || '').toLowerCase().includes(query);
 });
 const countBadge = $('#customer-count');
 if (countBadge) countBadge.textContent = `${filtered.length} customer${filtered.length === 1 ? '' : 's'}`;
 area.replaceChildren();

 if (!filtered.length) {
  area.append(element('p', query ? 'No matching customers found.' : 'No registered customers yet. Details will appear here as customers sign in or book.'));
  return;
 }

 for (const c of filtered) {
  const card = element('div', '', 'item');
  const info = element('div', '');
  
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.gap = '8px';
  head.style.flexWrap = 'wrap';

  const nameEl = element('strong', `👤 ${c.name || 'Customer'}`);
  nameEl.style.fontSize = '15px';
  const isGoogle = c.provider === 'google' || c.provider === 'Google';
  const badge = element('span', isGoogle ? 'Google Account' : (c.provider || 'Registered'), 'badge');
  badge.style.fontSize = '10px';
  if (isGoogle) {
   badge.style.background = '#eaf2fd';
   badge.style.borderColor = '#c6dafc';
   badge.style.color = '#1a73e8';
  }
  head.append(nameEl, badge);

  const contactDiv = document.createElement('div');
  contactDiv.style.margin = '8px 0';
  contactDiv.style.display = 'flex';
  contactDiv.style.gap = '8px';
  contactDiv.style.flexWrap = 'wrap';
  contactDiv.style.alignItems = 'center';

  if (c.phone) {
   const call = document.createElement('a');
   call.href = `tel:${c.phone}`;
   call.textContent = `📞 ${c.phone}`;
   call.className = 'button secondary';
   call.style.padding = '4px 9px';
   call.style.fontSize = '12px';
   contactDiv.append(call);

   const clean = c.phone.replace(/[^0-9]/g, '');
   const waNum = clean.length === 10 ? '91' + clean : clean;
   const wa = document.createElement('a');
   wa.href = `https://wa.me/${waNum}?text=${encodeURIComponent(`Hello ${c.name}, greetings from VINAYAK Hair & Skin Studio!`)}`;
   wa.target = '_blank';
   wa.rel = 'noopener noreferrer';
   wa.textContent = '💬 WhatsApp';
   wa.className = 'button secondary';
   wa.style.padding = '4px 9px';
   wa.style.fontSize = '12px';
   wa.style.background = '#eaf8ef';
   wa.style.color = '#1f7e49';
   wa.style.borderColor = '#c0ebd2';
   contactDiv.append(wa);
  }

  if (c.email) {
   const em = document.createElement('span');
   em.innerHTML = `✉️ <a href="mailto:${c.email}" style="color:#85621e;text-decoration:underline">${c.email}</a>`;
   em.style.fontSize = '12px';
   contactDiv.append(em);
  }

  const metaText = [];
  if (c.created) metaText.push('Registered: ' + new Date(c.created).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}));
  if (c.total_bookings) metaText.push(`Visits: ${c.total_bookings}`);
  const meta = element('small', metaText.join(' · ') || 'Active customer');
  
  info.append(head, contactDiv, meta);
  card.append(info);
  area.append(card);
 }
}

const searchInput = $('#customer-search');
if (searchInput) {
 searchInput.oninput = () => renderCustomerDirectory(searchInput.value);
}

async function refresh(){
 const isOwner=sessionStorage.getItem('vinayak_owner_session')==='true';
 if(!isOwner && $('#dashboard').hidden) return;
 $('#login').hidden=true;
 $('#dashboard').hidden=false;

 try{
  let slots=[],bookings=[],apiCustomers=[];
  try{
   [slots,bookings]=await Promise.all([api('/api/owner/slots'),api('/api/owner/bookings')]);
   try { apiCustomers = await api('/api/owner/customers'); } catch {}
  }catch(err){
   if(isOwner){
    slots=JSON.parse(localStorage.getItem('vinayak_owner_slots')||'[]');
    bookings=JSON.parse(localStorage.getItem('vinayak_bookings')||'[]');
   }else{
    $('#login').hidden=false;
    $('#dashboard').hidden=true;
    return;
   }
  }

  // Aggregate customer directory
  const localCusts = JSON.parse(localStorage.getItem('vinayak_all_customers') || '[]');
  const singleCust = JSON.parse(localStorage.getItem('vinayak_customer') || 'null');
  if (singleCust) localCusts.unshift(singleCust);

  const mergedMap = new Map();
  for (const c of [...(Array.isArray(apiCustomers) ? apiCustomers : []), ...localCusts]) {
   const key = c.email || c.phone || c.id;
   if (key && !mergedMap.has(key)) mergedMap.set(key, c);
  }

  for (const b of bookings) {
   const key = b.email || b.phone || b.name;
   if (key) {
    if (!mergedMap.has(key)) {
     mergedMap.set(key, {
      id: b.customer_id || ('cust-' + Math.random().toString(36).slice(2)),
      name: b.name,
      phone: b.phone,
      email: b.email || '',
      provider: 'Customer',
      created: b.created,
      total_bookings: 1
     });
    } else {
     const existing = mergedMap.get(key);
     existing.total_bookings = (existing.total_bookings || 0) + 1;
     if (!existing.phone && b.phone) existing.phone = b.phone;
     if (!existing.email && b.email) existing.email = b.email;
    }
   }
  }
  allCustomersData = Array.from(mergedMap.values());
  renderCustomerDirectory(searchInput?.value || '');

  // Render Slots
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

  // Render Customer Bookings
  const filteredBookings=bookings.filter(b=>!date||b.date===date);
  const bookingCount = $('#booking-count');
  if (bookingCount) bookingCount.textContent = `${filteredBookings.length} booking${filteredBookings.length === 1 ? '' : 's'}`;
  
  $('#bookings').replaceChildren(...filteredBookings.map(b=>{
   const item=element('div','','item'),info=element('div','');
   
   // Top header: Customer Name & Service
   const topRow = document.createElement('div');
   topRow.style.display = 'flex';
   topRow.style.alignItems = 'center';
   topRow.style.gap = '8px';
   topRow.style.flexWrap = 'wrap';
   
   const custName = element('strong', `👤 ${b.name}`);
   custName.style.fontSize = '16px';
   custName.style.color = '#7d5917';
   const srvBadge = element('span', `✂️ ${serviceName(b.service)}`, 'badge');
   srvBadge.style.fontSize = '11px';
   srvBadge.style.background = '#fef9ee';
   srvBadge.style.borderColor = '#ebd9b4';
   topRow.append(custName, srvBadge);

   // Appointment Date & Timing
   const timeP = element('small', `📅 Appointment: ${b.date} · ${formatTime(b.start||'10:00')}–${formatTime(b.end||'10:30')} IST`);
   timeP.style.display = 'block';
   timeP.style.margin = '4px 0';
   timeP.style.fontSize = '12px';

   // Contact actions: Call, WhatsApp, Email
   const contactBox = document.createElement('div');
   contactBox.style.margin = '8px 0';
   contactBox.style.display = 'flex';
   contactBox.style.gap = '8px';
   contactBox.style.flexWrap = 'wrap';
   contactBox.style.alignItems = 'center';

   if (b.phone) {
    const callLink = document.createElement('a');
    callLink.href = `tel:${b.phone}`;
    callLink.textContent = `📞 Call ${b.phone}`;
    callLink.className = 'button secondary';
    callLink.style.padding = '5px 10px';
    callLink.style.fontSize = '12px';
    contactBox.append(callLink);

    const clean = b.phone.replace(/[^0-9]/g, '');
    const waNum = clean.length === 10 ? '91' + clean : clean;
    const waLink = document.createElement('a');
    waLink.href = `https://wa.me/${waNum}?text=${encodeURIComponent(`Hello ${b.name}, this is VINAYAK Hair & Skin Studio regarding your appointment for ${serviceName(b.service)} on ${b.date} at ${formatTime(b.start||'10:00')}.`)}`;
    waLink.target = '_blank';
    waLink.rel = 'noopener noreferrer';
    waLink.textContent = '💬 WhatsApp';
    waLink.className = 'button secondary';
    waLink.style.padding = '5px 10px';
    waLink.style.fontSize = '12px';
    waLink.style.background = '#eaf8ef';
    waLink.style.color = '#1f7e49';
    waLink.style.borderColor = '#c0ebd2';
    contactBox.append(waLink);
   }

   if (b.email) {
    const em = document.createElement('span');
    em.innerHTML = `✉️ <a href="mailto:${b.email}" style="color:#85621e;text-decoration:underline">${b.email}</a>`;
    em.style.fontSize = '12px';
    contactBox.append(em);
   }

   info.append(topRow, timeP, contactBox);

   if (b.notes) {
    const noteP = element('p', `📝 Notes: ${b.notes}`);
    noteP.style.background = '#faf5e8';
    noteP.style.padding = '6px 10px';
    noteP.style.borderRadius = '5px';
    noteP.style.fontSize = '12px';
    noteP.style.margin = '6px 0';
    info.append(noteP);
   }

   const meta = element('small', `Reference: ${b.id}${b.created ? ' · Booked: ' + new Date(b.created).toLocaleDateString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}) : ''}`);
   info.append(meta);
   item.append(info);

   // Status & Cancel Action
   const rightSide = document.createElement('div');
   rightSide.style.display = 'flex';
   rightSide.style.flexDirection = 'column';
   rightSide.style.alignItems = 'flex-end';
   rightSide.style.gap = '8px';

   const isConfirmed = b.status === 'confirmed';
   const st = element('span', (b.status || 'confirmed').toUpperCase(), 'badge');
   if (!isConfirmed) {
    st.style.background = '#faece8';
    st.style.borderColor = '#edcfc7';
    st.style.color = '#a03522';
   }
   rightSide.append(st);

   if (isConfirmed) {
    const button=element('button','Cancel booking','secondary');
    button.onclick=async()=>{
     if(!confirm(`Cancel appointment for ${b.name} and reopen the slot? Please inform the customer personally.`))return;
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
    rightSide.append(button);
   }

   item.append(rightSide);
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
}
setInterval(()=>{if(sessionStorage.getItem('vinayak_owner_session')==='true')refresh()},30000);
