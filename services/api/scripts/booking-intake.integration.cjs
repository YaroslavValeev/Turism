const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const jwt=require('jsonwebtoken');
const connection=new URL(process.env.DATABASE_URL);
assert.match(connection.pathname,/^\/qa(?:_[a-z0-9]+)?$/);
assert.equal(process.env.BOOKING_INTAKE_QA_CONFIRM,'isolated-no-outbound-network');
assert.match(connection.hostname,/^tourism-intake-qa-20261005-[0-9a-f]+-db$/);
for(const key of Object.keys(process.env)) if(/^(SMTP_|TELEGRAM_|AI_|INGESTION_|EMAIL_)/.test(key))delete process.env[key];
Object.assign(process.env,{APP_ENV:'staging',JWT_SECRET:crypto.randomBytes(32).toString('hex'),ADMIN_JWT_SECRET:crypto.randomBytes(32).toString('hex'),ANALYTICS_ENABLED:'false',TELEGRAM_PUBLIC_BOT_ENABLED:'false',TELEGRAM_LONG_POLLING_ENABLED:'false',REVIEW_REQUEST_EMAIL_DISABLED:'true',PUBLIC_RATE_LIMIT_MAX:'80'});
const {loadEnv}=require('@mywave/config');
const env=loadEnv();
const {prisma}=require('./dist/lib/prisma.js');
const {bookingsRoutes}=require('./dist/modules/bookings/routes.js');
const {publicSubscriptionsRoutes}=require('./dist/modules/subscriptions/routes.js');
const report=[],probes=[];
let server;
async function main(){
 assert.equal(await prisma.booking.count(),0);
 assert.equal(await prisma.updateSubscription.count(),0);
 const org=await prisma.organizer.create({data:{displayName:'QA Организатор',contactEmail:'qa@example.invalid',verificationStatus:'verified'}});
 const start=new Date(Date.now()+30*86400000),end=new Date(Date.now()+35*86400000);
 const program=await prisma.program.create({data:{organizerId:org.id,title:'QA Выезд',discipline:'trekking',region:'Камчатка',startDate:start,endDate:end,durationDays:5,publishStatus:'published',reviewStatus:'ok'}});
 const hidden=await prisma.program.create({data:{organizerId:org.id,title:'QA Черновик',discipline:'trekking',region:'Камчатка',startDate:start,endDate:end,durationDays:5,publishStatus:'draft'}});
 const app=express();app.use(express.json());
 app.use('/bookings',bookingsRoutes(env));app.use('/subscriptions',publicSubscriptionsRoutes(env));
 app.use((e,req,res,next)=>res.status(500).json({error:'internal'}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const token=jwt.sign({sub:'qa-admin',role:'admin'},env.ADMIN_JWT_SECRET,{expiresIn:'5m'});
 async function request(name,path,body,expected,method='POST',admin=false){
  const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const data=await r.json();report.push({name,status:r.status,expected});
  assert.equal(r.status,expected,name);return data;
 }
 const booking={programId:program.id,guestContact:'qa-flow@example.invalid',legalConsent:true,sourceChannel:'isolated-qa',entryType:'program',entryId:program.id,utmSource:'qa'};
 await request('missing_contact','/bookings',{programId:program.id,legalConsent:true},400);
 await request('missing_consent','/bookings',{...booking,legalConsent:undefined},400);
 await request('false_consent','/bookings',{...booking,legalConsent:false},400);
 await request('string_consent','/bookings',{...booking,legalConsent:'true'},400);
 await request('draft_cannot_book','/bookings',{...booking,programId:hidden.id},404);
 const b=await request('successful_booking','/bookings',booking,201);
 assert.ok(b.legalConsentAt&&b.legalConsentPolicyVersion);
 assert.equal(b.organizerId,org.id);assert.equal(b.utmSource,'qa');
 assert.equal(await prisma.deal.count({where:{bookingId:b.id}}),1);
 const duplicate=await request('duplicate_booking','/bookings',booking,409);
 assert.equal(duplicate.bookingId,b.id);assert.equal(await prisma.booking.count(),1);
 await request('admin_queue_anonymous','/bookings',undefined,401,'GET');
 await request('invalid_state_jump','/bookings/'+b.id+'/status',{bookingStatus:'completed'},400,'PATCH',true);
 for(const state of ['reviewed','sent_to_organizer','contacted','offer_sent','booked','completed']){
  const updated=await request('booking_status_'+state,'/bookings/'+b.id+'/status',{bookingStatus:state},200,'PATCH',true);
  assert.equal(updated.bookingStatus,state);
 }
 assert.equal(await prisma.auditLog.count({where:{entityId:b.id,entityType:'booking'}}),6);
 assert.equal(await prisma.reviewRequest.count({where:{bookingId:b.id}}),1);
 assert.equal((await prisma.deal.findUnique({where:{bookingId:b.id}})).dealStatus,'completed');
 const subBody={email:'qa-flow@example.invalid',consent:true,source:'isolated-qa',levelRequired:'beginner',dateFrom:'2026-11-01'};
 const s=await request('email_subscription_saved_without_delivery','/subscriptions',subBody,201);
 assert.equal(s.emailDeliveryConfigured,false);assert.ok(s.message.includes('письма пока не отправляются'));
 const again=await request('subscription_idempotent','/subscriptions',subBody,200);
 assert.equal(again.id,s.id);assert.equal(await prisma.updateSubscription.count(),1);
 const stored=await prisma.updateSubscription.findUnique({where:{id:s.id}});
 assert.ok(stored.consentAt);assert.equal(stored.levelRequired,'beginner');
 await request('telegram_disabled','/subscriptions',{telegramUsername:'qa_user',consent:true},503);
 await request('invalid_subscription_day','/subscriptions',{...subBody,dateFrom:'2026-02-30'},400);
 await request('unsubscribe_post','/subscriptions/unsubscribe',{email:subBody.email},200);
 assert.equal((await prisma.updateSubscription.findUnique({where:{id:s.id}})).status,'unsubscribed');
 await request('unsubscribe_again','/subscriptions/unsubscribe',{email:subBody.email},404);
 await request('export_requires_admin','/subscriptions/admin/export',undefined,401,'GET');
 const countBeforeProbes=await prisma.booking.count();
 for(const [name,body] of [
  ['whitespace_only_contact',{...booking,guestContact:'   '}],
  ['non_string_contact',{...booking,guestContact:[]}],
  ['non_string_identifier',{...booking,programId:{}}],
  ['non_string_notes',{...booking,notes:1}],
  ['oversized_contact',{...booking,guestContact:'a'.repeat(255)}]
 ]){
  const response=await fetch(base+'/bookings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  await response.body?.cancel();
  probes.push({name,status:response.status,expected:400,passed:response.status===400});
 }
 assert.equal(await prisma.booking.count(),countBeforeProbes,'PROBE_CREATED_BUSINESS_RECORD');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),integrationScenarios:report.length,report,probes,database:'disposable qa',outboundNetwork:'blocked',productionChanged:false},null,2));
 assert.equal(await prisma.subscriptionDelivery.count(),0);
 console.log('ISOLATED_CORE_SCENARIOS_PASSED');
 assert.ok(probes.every(p=>p.passed),'INPUT_VALIDATION_REGRESSION');
 console.log('INPUT_VALIDATION_REGRESSION_PASSED');
}
main().catch(e=>{console.error('STOP:',e.message);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();});
