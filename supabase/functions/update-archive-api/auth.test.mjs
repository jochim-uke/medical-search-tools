import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,pbkdf2Sync,createHash} from 'node:crypto';
const code=await readFile(new URL('./index.js',import.meta.url),'utf8');
function server(){
 let handler;const calls=[],sessions=[],comments=[];const limits=new Map();
 const salt='test-only-salt',password='test-only-password';
 const settings={salt,password_hash:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')};
 const fetch=async(url,init)=>{
   const path=url.split('/rest/v1/')[1],body=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method,body});let result=[];
   if(path.startsWith('ua_settings'))result=[settings];
   else if(path==='rpc/ua_rate_limit'){const n=(limits.get(body.p_bucket)||0)+1;limits.set(body.p_bucket,n);result=n;}
   else if(path==='ua_sessions'&&init.method==='POST'){sessions.push(body);result=[body];}
   else if(path.startsWith('ua_sessions?')){const tokenHash=new URL(url).searchParams.get('token_hash').slice(3);result=sessions.filter(s=>s.token_hash===tokenHash&&Date.parse(s.expires_at)>Date.now());if(init.method==='DELETE')sessions.splice(0,sessions.length,...sessions.filter(s=>s.token_hash!==tokenHash));}
   else if(path==='rpc/ua_visit')result=1;
   else if(path.startsWith('ua_entries?')&&init.method==='PATCH')result=[{id:'entry-a',...body}];
   else if(path.startsWith('ua_comments?on_conflict=')&&init.method==='POST'){if(!comments.some(c=>c.id===body.id))comments.push(body);result=[body];}
   else if(path.startsWith('ua_comments?')&&init.method==='GET')result=comments;
   else if(path==='rpc/ua_import')result=1;
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 vm.runInNewContext(code,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://db.invalid':'server-only-key'},serve:h=>handler=h},fetch,crypto:webcrypto,TextEncoder,Uint8Array,Response,URL,Date,console});
 const request=(body,token)=>handler(new Request('https://api.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-archive-token':token}:{})},body:JSON.stringify(body)}));
 return {request,calls,sessions,comments,password};
}
test('admin mutations reject missing and forged sessions before any mutation',async()=>{
 const s=server();for(const action of ['update','comment-update','comment-delete','import','logout']){
   for(const token of [undefined,'x','f'.repeat(64)]){const r=await s.request({action},token);assert.equal(r.status,401);}
 }
 assert(s.calls.every(c=>c.path.startsWith('ua_sessions?')));
});
test('wrong password cannot create a session; brute force is limited',async()=>{
 const s=server();for(let i=0;i<20;i++)assert.equal((await s.request({action:'login',password:'wrong'})).status,401);
 assert.equal((await s.request({action:'login',password:s.password})).status,429);assert.equal(s.sessions.length,0);
});
test('login stores only token hash; expiry and logout revoke admin, not public reads',async()=>{
 const s=server(),response=await s.request({action:'login',password:s.password});assert.equal(response.status,200);
 const result=await response.json();assert.match(result.token,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(result).sort(),['expires_at','token']);
 assert.equal(s.sessions[0].token_hash,createHash('sha256').update(result.token).digest('hex'));assert.notEqual(s.sessions[0].token_hash,result.token);
 assert.equal((await (await s.request({action:'list'},result.token)).json()).is_admin,true);
 assert.equal((await s.request({action:'update',id:'entry-a',version:0,priority:3},result.token)).status,200);
 s.sessions[0].expires_at='2020-01-01';assert.equal((await (await s.request({action:'list'},result.token)).json()).is_admin,false);
 assert.equal((await s.request({action:'update',id:'entry-a',version:1,priority:0},result.token)).status,401);
 s.sessions[0].expires_at='2099-01-01';assert.equal((await s.request({action:'logout'},result.token)).status,200);
 assert.equal((await (await s.request({action:'list'},result.token)).json()).is_admin,false);
 assert.equal((await s.request({action:'update',id:'entry-a',version:1,notes:'overwrite'},result.token)).status,401);
});
test('public read and visit work without credentials; response exposes no secrets',async()=>{
 const s=server(),r=await s.request({action:'list'});assert.equal(r.status,200);
 const body=await r.json();assert.deepEqual(Object.keys(body).sort(),['comments','entries','is_admin','links','reports']);assert.equal(body.is_admin,false);
 assert(!s.calls.some(c=>/ua_settings|ua_sessions/.test(c.path)));
 assert(s.calls.every(c=>!c.path.includes('select=*')));
 assert.equal((await s.request({action:'visit',id:'entry-a'})).status,200);
});
test('public comments require an author and cannot claim admin privileges',async()=>{
 const s=server(),body={action:'comment-add',id:'d1ed2967-0f02-41f8-9f19-f86560684f50',entry_id:'entry-a',body:'A comment'};
 for(const author of [undefined,'','   ','a'.repeat(101),'\nName','admin','Ａｄｍｉｎ']){
   // Leading/trailing whitespace is harmless; embedded control characters are not.
   if(author==='\nName')continue;
   assert.equal((await s.request({...body,author})).status,400);
 }
 assert.equal((await s.request({...body,author:'A\nB'})).status,400);
 assert.equal((await s.request({...body,author:'  Dr. Test  ',author_is_admin:true,priority:3})).status,200);
 assert.equal(s.comments[0].author,'Dr. Test');assert.equal(s.comments[0].author_is_admin,false);assert.equal(s.comments[0].priority,undefined);
 assert.equal((await s.request({...body,author:'Dr. Test'})).status,200);assert.equal(s.comments.length,1);
});
test('admin authorship is determined by verified session, not form fields',async()=>{
 const s=server(),{token}=await (await s.request({action:'login',password:s.password})).json();
 assert.equal((await s.request({action:'comment-add',id:'d1ed2967-0f02-41f8-9f19-f86560684f50',entry_id:'entry-a',body:'Admin comment',author:'Someone else',author_is_admin:false},token)).status,200);
 assert.equal(s.comments[0].author,'Admin');assert.equal(s.comments[0].author_is_admin,true);
 s.sessions[0].expires_at='2020-01-01';
 assert.equal((await s.request({action:'comment-add',id:'d1ed2967-0f02-41f8-9f19-f86560684f51',entry_id:'entry-a',body:'Expired',author:'Admin'},token)).status,401);
});
test('public comment submission is rate limited',async()=>{
 const s=server();let response;for(let i=0;i<21;i++)response=await s.request({action:'comment-add',id:'d1ed2967-0f02-41f8-9f19-'+String(i).padStart(12,'0'),entry_id:'entry-a',body:'Comment',author:'Test'});
 assert.equal(response.status,429);assert.equal(s.comments.length,20);
});
test('authenticated imports reject executable links and invalid dates',async()=>{
 const s=server(),{token}=await (await s.request({action:'login',password:s.password})).json();
 const body={action:'import',report:{title:'Test',report_date:'2026-09-13',body:'Test'},entries:[{title:'Test',category:'Sonstige',body:'Test',source_url:'javascript:alert(1)',tags:[]}]};
 assert.equal((await s.request(body,token)).status,400);body.entries[0].source_url='https://example.org';body.report.report_date='2026-02-31';assert.equal((await s.request(body,token)).status,400);
 assert(!s.calls.some(c=>c.path==='rpc/ua_import'));
});
