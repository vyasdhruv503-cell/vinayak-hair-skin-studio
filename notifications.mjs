import {salonMapsUrl,salonName} from './salon-info.mjs';

const dateTime=booking=>`${booking.date} ${booking.start}–${booking.end} IST`;
const digits=phone=>{const n=phone.replace(/\D/g,'');return n.length===10?'91'+n:n;};

export async function sendBookingNotifications(booking,{email='',whatsappOptIn=false}={},fetchImpl=fetch){
 const result={whatsapp:'not_requested',email:'not_requested'};
 const jobs=[];
 if(whatsappOptIn){
  const {WHATSAPP_ACCESS_TOKEN:token,WHATSAPP_PHONE_NUMBER_ID:phoneId,WHATSAPP_TEMPLATE_NAME:template,WHATSAPP_TEMPLATE_LANGUAGE:language='en',WHATSAPP_GRAPH_VERSION:version}=process.env;
  if(token&&phoneId&&template&&/^v\d+\.\d+$/.test(version||'')){
   jobs.push((async()=>{try{
    const response=await fetchImpl(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:digits(booking.phone),type:'template',template:{name:template,language:{code:language},components:[{type:'body',parameters:[booking.service,dateTime(booking),salonMapsUrl,booking.id].map(text=>({type:'text',text}))}]}})});
    result.whatsapp=response.ok?'submitted':'failed';
   }catch{result.whatsapp='failed';}})());
  }else result.whatsapp='not_configured';
 }
 if(email){
  const {RESEND_API_KEY:key,BOOKING_EMAIL_FROM:from}=process.env;
  if(key&&from){
   jobs.push((async()=>{try{
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`booking/${booking.id}`},body:JSON.stringify({from,to:[email],subject:`Your appointment at ${salonName}`,text:`Your appointment is confirmed.\n\nService: ${booking.service}\nDate and time: ${dateTime(booking)}\nReference: ${booking.id}\nSalon location: ${salonMapsUrl}\n\n${salonName}, Vadodara`})});
    result.email=response.ok?'submitted':'failed';
   }catch{result.email='failed';}})());
  }else result.email='not_configured';
 }
 await Promise.all(jobs);
 return result;
}
