import fs from 'node:fs';
const cid='7981718466852628767';let resolvedPlaceId='',lookupAttempted=false,inFlight=null,windowStart=0,requests=0;
export async function getGoogleRating(){
 const key=process.env.GOOGLE_PLACES_API_KEY_FILE?fs.readFileSync(process.env.GOOGLE_PLACES_API_KEY_FILE,'utf8').trim():process.env.GOOGLE_PLACES_API_KEY;
 if(!key)return {configured:false,status:'not_connected'};
 if(inFlight)return inFlight;
 if(Date.now()-windowStart>=3600000){windowStart=Date.now();requests=0;}
 if(requests>=60)return {configured:true,status:'temporarily_unavailable'};
 requests++;
 inFlight=(async()=>{try{
  let placeId=process.env.GOOGLE_PLACE_ID||resolvedPlaceId;
  if(!placeId&&!lookupAttempted){lookupAttempted=true;const r=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.googleMapsUri'},body:JSON.stringify({textQuery:'Vinayak Hair & Skin Studio, Sardar Estate, Vadodara, Gujarat',locationBias:{circle:{center:{latitude:22.3181806,longitude:73.2375798},radius:100}}}),signal:AbortSignal.timeout(8000)});if(r.ok){const found=await r.json();for(const p of found.places||[]){try{if(new URL(p.googleMapsUri).searchParams.get('cid')===cid)resolvedPlaceId=p.id;}catch{}}placeId=resolvedPlaceId;}}
  if(!placeId||!/^[A-Za-z0-9_-]{5,200}$/.test(placeId))return {configured:true,status:'place_id_required'};
  const r=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'rating,userRatingCount,googleMapsUri,attributions'},signal:AbortSignal.timeout(8000)});if(!r.ok)return {configured:true,status:'temporarily_unavailable'};
  const p=await r.json();return {configured:true,status:'ok',rating:typeof p.rating==='number'&&p.rating>=1&&p.rating<=5?p.rating:null,count:Number.isInteger(p.userRatingCount)&&p.userRatingCount>=0?p.userRatingCount:0,attributions:(p.attributions||[]).map(a=>({provider:a.provider||'',providerUri:a.providerUri||''}))};
 }catch{return {configured:true,status:'temporarily_unavailable'}}})();
 try{return await inFlight;}finally{inFlight=null;}
}
