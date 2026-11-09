import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
test('Google rating uses authenticated live API data and handles missing configuration without fake values',async()=>{
 const previous={key:process.env.GOOGLE_PLACES_API_KEY,file:process.env.GOOGLE_PLACES_API_KEY_FILE,id:process.env.GOOGLE_PLACE_ID},fetchOriginal=globalThis.fetch;
 try{
  process.env.GOOGLE_PLACES_API_KEY='';process.env.GOOGLE_PLACES_API_KEY_FILE='';process.env.GOOGLE_PLACE_ID='test-place-id';
  let module=await import('../google-rating.mjs?test='+randomUUID());assert.deepEqual(await module.getGoogleRating(),{configured:false,status:'not_connected'});
  process.env.GOOGLE_PLACES_API_KEY='test-key-not-real';let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['X-Goog-Api-Key'],'test-key-not-real');assert.match(options.headers['X-Goog-FieldMask'],/rating/);return new Response(JSON.stringify({rating:4.3,userRatingCount:23,attributions:[]}));};
  const data=await module.getGoogleRating();assert.equal(data.rating,4.3);assert.equal(data.count,23);assert.equal(calls,1);assert.ok(!JSON.stringify(data).includes('test-key'));
  globalThis.fetch=async()=>new Response('{}',{status:403});assert.deepEqual(await module.getGoogleRating(),{configured:true,status:'temporarily_unavailable'});
  process.env.GOOGLE_PLACE_ID='';module=await import('../google-rating.mjs?test='+randomUUID());calls=0;
  globalThis.fetch=async(url)=>{calls++;return new Response(JSON.stringify(calls===1?{places:[{id:'resolved-test-place',googleMapsUri:'https://maps.google.com/?cid=7981718466852628767'}]}:{rating:4.1,userRatingCount:8}));};
  assert.equal((await module.getGoogleRating()).rating,4.1);assert.equal(calls,2);
  module=await import('../google-rating.mjs?test='+randomUUID());calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({places:[{id:'wrong-place',googleMapsUri:'https://maps.google.com/?cid=123'}]}));};assert.equal((await module.getGoogleRating()).status,'place_id_required');assert.equal(calls,1);
 }finally{globalThis.fetch=fetchOriginal;for(const [key,value] of [['GOOGLE_PLACES_API_KEY',previous.key],['GOOGLE_PLACES_API_KEY_FILE',previous.file],['GOOGLE_PLACE_ID',previous.id]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
