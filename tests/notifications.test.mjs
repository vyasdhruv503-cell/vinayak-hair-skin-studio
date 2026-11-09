import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendBookingNotifications} from '../notifications.mjs';

test('Booking notifications include the correct location and do not claim delivery without provider acceptance',async()=>{
 const names=['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME','WHATSAPP_TEMPLATE_LANGUAGE','WHATSAPP_GRAPH_VERSION','RESEND_API_KEY','BOOKING_EMAIL_FROM'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const booking={id:'reference-1',service:'Haircut',date:'2030-01-02',start:'10:30',end:'11:00',phone:'9999999999'};
 try{
  for(const name of names)delete process.env[name];
  assert.deepEqual(await sendBookingNotifications(booking,{email:'customer@example.com',whatsappOptIn:true},()=>{throw Error('Should not send');}),{whatsapp:'not_configured',email:'not_configured'});
  Object.assign(process.env,{WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_TEMPLATE_NAME:'vinayak_booking_location',WHATSAPP_GRAPH_VERSION:'v25.0',RESEND_API_KEY:'test-key',BOOKING_EMAIL_FROM:'VINAYAK <bookings@example.com>'});
  const sent=[];const fakeFetch=async(url,options)=>{sent.push({url,options});return {ok:!url.includes('resend.com')};};
  assert.deepEqual(await sendBookingNotifications(booking,{email:'customer@example.com',whatsappOptIn:true},fakeFetch),{whatsapp:'submitted',email:'failed'});
  assert.equal(sent.length,2);
  const whatsapp=sent.find(x=>x.url.includes('graph.facebook.com'));assert.equal(JSON.parse(whatsapp.options.body).to,'919999999999');assert.equal(JSON.parse(whatsapp.options.body).template.components[0].parameters[2].text,'https://maps.app.goo.gl/RDEsMfAkHjaj4be2A');
  const email=sent.find(x=>x.url.includes('resend.com'));assert.match(JSON.parse(email.options.body).text,/maps\.app\.goo\.gl\/RDEsMfAkHjaj4be2A/);
 }finally{for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}}
});
