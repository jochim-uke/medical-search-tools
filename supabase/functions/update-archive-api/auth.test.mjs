import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,pbkdf2Sync,createHash} from 'node:crypto';
const code=await readFile(new URL('./index.js',import.meta.url),'utf8');
function server(){
 let handler;const calls=[],sessions=[];let attempts=0;
 const salt='test-only-salt',password='test-only-password';
 const settings={salt,password_hash:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')};
 const fetch=async(url,init)=>{
   const path=url.split('/rest/v1/')[1],body=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method,body});let result=[];
   if(path.startsWith('ua_settings'))result=[settings];
   else if(path==='rpc/ua_rate_limit')result=++attempts;
   else if(path==='ua_sessions'&&init.method==='POST'){sessions.push(body);result=[body];}
   else if(path.startsWith('ua_sessions?')){const tokenHash=new URL(url).searchParams.get('token_hash').slice(3);result=sessions.filter(s=>s.token_hash===tokenHash&&Date.parse(s.expires_at)>Date.now());if(init.method==='DELETE')sessions.splice(0,sessions.length,...sessions.filter(s=>s.token_hash!==tokenHash));}
   else if(path==='rpc/ua_visit')result=1;
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 vm.runInNewContext(code,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://db.invalid':'server-only-key'},serve:h=>handler=h},fetch,crypto:webcrypto,TextEncoder,Uint8Array,Response,URL,Date,console});
 const request=(body,token)=>handler(new Request('https://api.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-archive-token':token}:{})},body:JSON.stringify(body)}));
 return {request,calls,sessions,password};
}
test('all read/write actions reject missing and forged sessions before data access',async()=>{
 const s=server();for(const action of ['list','visit','update','comment-add','comment-update','comment-delete','import','logout']){
   for(const token of [undefined,'x','f'.repeat(64)]){const r=await s.request({action},token);assert.equal(r.status,401);}
 }
 assert(s.calls.every(c=>c.path.startsWith('ua_sessions?')));
});
test('wrong password cannot create a session; brute force is limited',async()=>{
 const s=server();for(let i=0;i<20;i++)assert.equal((await s.request({action:'login',password:'wrong'})).status,401);
 assert.equal((await s.request({action:'login',password:s.password})).status,429);assert.equal(s.sessions.length,0);
});
test('login stores only token hash, authenticates read, logout revokes, expired sessions denied',async()=>{
 const s=server(),response=await s.request({action:'login',password:s.password});assert.equal(response.status,200);
 const result=await response.json();assert.match(result.token,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(result).sort(),['expires_at','token']);
 assert.equal(s.sessions[0].token_hash,createHash('sha256').update(result.token).digest('hex'));assert.notEqual(s.sessions[0].token_hash,result.token);
 assert.equal((await s.request({action:'list'},result.token)).status,200);
 s.sessions[0].expires_at='2020-01-01';assert.equal((await s.request({action:'list'},result.token)).status,401);
 s.sessions[0].expires_at='2099-01-01';assert.equal((await s.request({action:'logout'},result.token)).status,200);assert.equal((await s.request({action:'list'},result.token)).status,401);
});
test('authenticated imports reject executable links and invalid dates',async()=>{
 const s=server(),{token}=await (await s.request({action:'login',password:s.password})).json();
 const body={action:'import',report:{title:'Test',report_date:'2026-09-13',body:'Test'},entries:[{title:'Test',category:'Sonstige',body:'Test',source_url:'javascript:alert(1)',tags:[]}]};
 assert.equal((await s.request(body,token)).status,400);body.entries[0].source_url='https://example.org';body.report.report_date='2026-02-31';assert.equal((await s.request(body,token)).status,400);
 assert(!s.calls.some(c=>c.path==='rpc/ua_import'));
});
