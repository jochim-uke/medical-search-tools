const base = Deno.env.get('SUPABASE_URL');
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const categories = ['Publikationen','Kongressbeiträge','Zulassungsrelevante News','Pressemitteilungen','Sonstige'];
const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
const hash = async text => hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));
class APIError extends Error { constructor(message,status=400){super(message);this.status=status;} }
async function db(path,method='GET',body,prefer='return=representation') {
  const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok) throw new APIError('Speichern oder Laden fehlgeschlagen. Bitte erneut versuchen.',502);
  const text=await response.text(); return text?JSON.parse(text):null;
}
async function all(table,order='id'){
  const rows=[]; for(let offset=0;;offset+=500){const page=await db(`${table}?select=*&order=${order}&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)return rows;}
}
function text(value,max,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new APIError('Bitte Eingaben und Textlänge prüfen.');return value.trim();}
function validURL(value){if(!value)return '';try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw 0;return url.href;}catch{throw new APIError('Bitte einen gültigen http(s)-Quellenlink verwenden.');}}
const eq=value=>encodeURIComponent(value);
async function action(req,body){
  if(body.action==='login'){
    const password=text(body.password,256);
    const [settings]=await db('ua_settings?select=salt,password_hash&limit=1');
    if(!settings)throw new APIError('Das Archiv ist noch nicht eingerichtet.',503);
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    const bucket=await hash(settings.salt+ip);
    const attempts=await db('rpc/ua_rate_limit','POST',{p_bucket:bucket});
    if(attempts>20)throw new APIError('Zu viele Anmeldeversuche. Bitte in zehn Minuten erneut versuchen.',429);
    const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
    const result=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(settings.salt),iterations:100000,hash:'SHA-256'},key,256));
    let diff=result.length^settings.password_hash.length;for(let i=0;i<result.length;i++)diff|=result.charCodeAt(i)^settings.password_hash.charCodeAt(i);
    if(diff)throw new APIError('Das Passwort stimmt nicht.',401);
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    const expires_at=new Date(Date.now()+(body.remember?30:1)*86400000).toISOString();
    await db('ua_sessions','POST',{token_hash:await hash(token),expires_at});
    return {token,expires_at};
  }
  const token=req.headers.get('x-archive-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))throw new APIError('Bitte anmelden.',401);
  const tokenHash=await hash(token);
  const sessions=await db(`ua_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${eq(new Date().toISOString())}&select=token_hash`);
  if(!sessions.length)throw new APIError('Die Anmeldung ist abgelaufen. Bitte erneut anmelden.',401);
  if(body.action==='logout'){await db(`ua_sessions?token_hash=eq.${tokenHash}`,'DELETE');return {ok:true};}
  if(body.action==='list'){
    const [entries,reports,comments,links]=await Promise.all([all('ua_entries'),all('ua_reports'),all('ua_comments'),all('ua_report_entries','report_id,entry_id')]);
    return {entries,reports,comments,links};
  }
  if(body.action==='visit')return {clicks:await db('rpc/ua_visit','POST',{p_entry:text(body.id,200)})};
  if(body.action==='update'){
    const id=text(body.id,200);if(!Number.isInteger(body.version)||body.version<0)throw new APIError('Ungültiger Versionsstand.');
    const patch={version:body.version+1};
    if(body.notes!==undefined)patch.notes=text(body.notes,40000,false);
    if(body.priority!==undefined){if(!Number.isInteger(body.priority)||body.priority<0||body.priority>3)throw new APIError('Ungültige Priorität.');patch.priority=body.priority;}
    if(Object.keys(patch).length===1)throw new APIError('Keine Änderung angegeben.');
    const rows=await db(`ua_entries?id=eq.${eq(id)}&version=eq.${body.version}`,'PATCH',patch);
    if(!rows.length)throw new APIError('Der Eintrag wurde zwischenzeitlich geändert. Bitte Ansicht aktualisieren; dein Text bleibt im Eingabefeld.',409);
    return {entry:rows[0]};
  }
  if(body.action==='comment-add'){
    const id=text(body.id,36);if(!/^[a-f0-9-]{36}$/i.test(id))throw new APIError('Ungültige Kommentar-ID.');
    await db('ua_comments?on_conflict=id','POST',{id,entry_id:text(body.entry_id,200),body:text(body.body,20000)},'resolution=ignore-duplicates,return=representation');return {ok:true};
  }
  if(['comment-update','comment-delete'].includes(body.action)){
    if(!Number.isInteger(body.version)||body.version<0)throw new APIError('Ungültiger Versionsstand.');
    const rows=await db(`ua_comments?id=eq.${eq(text(body.id,36))}&version=eq.${body.version}`,body.action==='comment-delete'?'DELETE':'PATCH',body.action==='comment-delete'?undefined:{body:text(body.body,20000),version:body.version+1});
    if(!rows.length)throw new APIError('Der Kommentar wurde zwischenzeitlich geändert. Bitte aktualisieren.',409);return {ok:true};
  }
  if(body.action==='import'){
    const report=body.report; if(!report||!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>100)throw new APIError('Bitte 1 bis 100 Meldungen zum Import auswählen.');
    const date=text(report.report_date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new APIError('Ungültiges Berichtsdatum.');
    const r={title:text(report.title,300),report_date:date,body:text(report.body,250000)};
    r.id='report:'+await hash(date+'\n'+r.body);
    const entries=[];
    for(const entry of body.entries){
      const e={title:text(entry.title,500),body:text(entry.body,40000),category:entry.category,source_url:validURL(text(entry.source_url||'',3000,false)),tags:[]};
      if(!categories.includes(e.category))throw new APIError('Unbekannte Kategorie.');
      if(!Array.isArray(entry.tags)||entry.tags.length>30)throw new APIError('Zu viele Schlagwörter.');
      e.tags=entry.tags.map(tag=>text(tag,100));
      const pmid=(e.source_url+' '+e.body).match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)||e.body.match(/PMID\s*:?\s*(\d+)/i);
      const doi=(e.source_url+' '+e.body).match(/(?:doi\.org\/|\bdoi:\s*)(10\.\d{4,9}\/[^\s)]+)/i);
      const generic=['www.fda.gov','fda.gov','www.ema.europa.eu','ema.europa.eu'];
      const sourceIdentity=e.source_url&&!generic.includes(new URL(e.source_url).hostname)?e.source_url.split('#')[0]:'';
      e.id=pmid?'pubmed:'+pmid[1]:doi?'doi:'+doi[1].toLowerCase():'item:'+await hash(sourceIdentity||e.title+'\n'+e.body);
      entries.push(e);
    }
    return {added:await db('rpc/ua_import','POST',{p_report:r,p_entries:entries}),report_id:r.id};
  }
  throw new APIError('Unbekannte Aktion.');
}
Deno.serve(async req=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey, x-archive-token','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return new Response(JSON.stringify({error:'POST erforderlich.'}),{status:405,headers});
  try{
    const raw=await req.text();if(raw.length>1500000)throw new APIError('Der Bericht ist zu groß.',413);
    let body;try{body=JSON.parse(raw);}catch{throw new APIError('Ungültiges JSON.');}
    if(!body||typeof body!=='object')throw new APIError('Ungültige Anfrage.');
    return new Response(JSON.stringify(await action(req,body)),{headers});
  }catch(error){return new Response(JSON.stringify({error:error instanceof APIError?error.message:'Die Anfrage konnte nicht verarbeitet werden.'}),{status:error instanceof APIError?error.status:500,headers});}
});
