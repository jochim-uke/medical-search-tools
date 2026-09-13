import {categories,normalize,plain,selectEntries,splitReport,makeDraft} from './core.mjs';
const API='https://tjjtemvclcgqmuhlnumr.supabase.co/functions/v1/update-archive-api';
const KEY='sb_publishable_ZYbal6vsT-gcmAHu-eugKw_h7Fif-1x';
const $=s=>document.querySelector(s), el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
let token=sessionStorage.getItem('update-archive-token')||localStorage.getItem('update-archive-token')||'';
let data={entries:[],reports:[],comments:[],links:[]},category='',activeId='',drafts=[],importReport=null,notesDirty=false;
async function api(action,body={}){
  let response;try{response=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:KEY,...(token?{'x-archive-token':token}:{})},body:JSON.stringify({action,...body})});}catch{throw new Error('Keine Verbindung. Bitte erneut versuchen; dein Eingabetext bleibt erhalten.');}
  const result=await response.json().catch(()=>({error:'Ungültige Serverantwort.'}));
  if(!response.ok){const error=new Error(result.error||'Die Anfrage ist fehlgeschlagen.');error.status=response.status;throw error;}return result;
}
function message(node,text,ok=false){node.textContent=text;node.classList.toggle('saved',ok);}
async function busy(button,work,status=$('#status')){button.disabled=true;try{await work();}catch(error){message(status,error.message);}finally{button.disabled=false;}}
function button(label,handler,className='secondary'){const b=el('button',className,label);b.type='button';b.addEventListener('click',()=>handler(b));return b;}
function formatDate(date){return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date));}
function link(label,url){const a=el('a','',label);try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))return el('span','',label);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';}catch{return el('span','',label);}return a;}
function rich(value){const container=el('div','rich-text');const re=/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;let start=0;for(const match of value.matchAll(re)){container.append(document.createTextNode(value.slice(start,match.index)));container.append(match[3]?el('strong','',match[3]):link(match[1],match[2]));start=match.index+match[0].length;}container.append(document.createTextNode(value.slice(start)));return container;}
function entries(){return data.entries.map(e=>({...e,comments:data.comments.filter(c=>c.entry_id===e.id)}));}
async function load(){const next=await api('list');data=next;$('#login').hidden=true;$('#workspace').hidden=false;$('#account').hidden=false;render();}
function forget(){token='';sessionStorage.removeItem('update-archive-token');localStorage.removeItem('update-archive-token');data={entries:[],reports:[],comments:[],links:[]};$('#results').replaceChildren();$('#detail-content').replaceChildren();$('#reports-list').replaceChildren();$('#workspace').hidden=true;$('#account').hidden=true;$('#login').hidden=false;}
$('#login-form').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{message($('#login-status'),'Archiv wird geöffnet …');const result=await api('login',{password:$('#password').value,remember:$('#remember').checked});token=result.token;sessionStorage.removeItem('update-archive-token');localStorage.removeItem('update-archive-token');($('#remember').checked?localStorage:sessionStorage).setItem('update-archive-token',token);$('#password').value='';await load();message($('#login-status'),'');},$('#login-status'));});
$('#show-password').onclick=()=>{const visible=$('#password').type==='password';$('#password').type=visible?'text':'password';$('#show-password').textContent=visible?'Ausblenden':'Anzeigen';$('#show-password').setAttribute('aria-pressed',String(visible));};
$('#logout').onclick=()=>busy($('#logout'),async()=>{await api('logout');forget();});
$('#refresh').onclick=()=>busy($('#refresh'),async()=>{await load();message($('#status'),'Archiv aktualisiert.',true);});
function filters(){return {query:$('#search').value,category,sort:$('#sort').value,from:$('#from').value,to:$('#to').value,priority:$('#priority-filter').value,noted:$('#only-noted').checked};}
for(const id of ['search','sort','from','to','priority-filter','only-noted'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
$('#reset').onclick=()=>{category='';$('#search').value='';$('#from').value='';$('#to').value='';$('#priority-filter').value='all';$('#only-noted').checked=false;$('#sort').value='newest';render();};
function priorityControl(entry,status=$('#status')){
  const group=el('div','priority-control');group.setAttribute('role','group');group.setAttribute('aria-label','Priorität');
  for(let p=0;p<4;p++){const b=button(p?'+'.repeat(p):'–',b=>busy(b,async()=>{const result=await api('update',{id:entry.id,version:entry.version,priority:p});Object.assign(entry,result.entry);const stored=data.entries.find(e=>e.id===entry.id);Object.assign(stored,result.entry);render();group.querySelectorAll('button').forEach((n,i)=>n.setAttribute('aria-pressed',String(i===p)));},status),'');b.setAttribute('aria-pressed',String(entry.priority===p));b.setAttribute('aria-label',p?'Priorität '+p:'Keine Priorität');group.append(b);}return group;
}
function render(){
  const all=entries(),f=filters(),shown=selectEntries(all,f);$('#entry-count').textContent=all.length;$('#report-count').textContent=data.reports.length;$('#noted-count').textContent=all.filter(e=>e.notes.trim()||e.comments.length).length;
  $('#interest-help').hidden=f.sort!=='interest';$('#result-count').textContent=`${shown.length} von ${all.length} Meldungen`;
  $('#categories').replaceChildren();for(const cat of ['',...categories]){const count=cat?all.filter(e=>e.category===cat).length:all.length;const b=button(`${cat||'Alle'} · ${count}`,()=>{category=cat;render();},'chip'+(category===cat?' active':''));b.setAttribute('aria-pressed',String(category===cat));$('#categories').append(b);}
  $('#results').replaceChildren();if(!shown.length){$('#results').append(el('div','empty',all.length?'Keine passenden Meldungen. Ändere den Suchtext oder die Filter.':'Noch keine Meldungen. Füge deinen ersten Wochenbericht hinzu.'));return;}
  for(const entry of shown){
    const card=el('article','entry');card.dataset.priority=entry.priority;const main=el('div'),meta=el('div','meta');meta.append(el('span','badge',entry.category),el('span','',`Bericht vom ${formatDate(entry.report_date)}`));
    const h=el('h3');h.append(button(entry.title,()=>openEntry(entry.id),'open-entry'));main.append(meta,h,el('p','excerpt',plain(entry.body).slice(0,260)+(plain(entry.body).length>260?' …':'')));
    const tags=el('div','tags');entry.tags.forEach(t=>tags.append(el('span','tag',t)));main.append(tags);
    const terms=normalize(f.query).split(/\s+/).filter(Boolean),noteHit=[entry.notes,...entry.comments.map(c=>c.body)].find(t=>terms.length&&terms.some(q=>normalize(t).includes(q)));
    if(noteHit)main.append(el('p','search-match','Eigene Gedanken: '+noteHit.slice(0,300)));
    const bottom=el('div','entry-bottom');bottom.append(button('Lesen & kommentieren →',()=>openEntry(entry.id),'text-button'),el('span','',`${entry.comments.length} Kommentare`),el('span','',`${entry.clicks} Aufruftage`));if(entry.notes.trim())bottom.append(el('span','','Notiz vorhanden'));main.append(bottom);
    const side=el('div');side.append(el('p','priority-caption','Meine Priorität'),priorityControl(entry));card.append(main,side);$('#results').append(card);
  }
}
async function openEntry(id){
  activeId=id;notesDirty=false;drawDetail();$('#detail').showModal();
  try{const result=await api('visit',{id});const entry=data.entries.find(e=>e.id===id);if(entry)entry.clicks=result.clicks;render();}catch(error){message($('#detail-status'),error.message);}
}
function drawDetail(){
  const entry=data.entries.find(e=>e.id===activeId);if(!entry)return;const root=$('#detail-content');root.replaceChildren();const status=el('p');status.id='detail-status';status.setAttribute('role','status');
  const meta=el('div','meta');meta.append(el('span','badge',entry.category),el('span','',`Bericht vom ${formatDate(entry.report_date)}`));root.append(meta,el('h2','detail-title',entry.title));
  const tools=el('div','detail-tools');tools.append(priorityControl(entry,status));if(entry.source_url)tools.append(link('Originalquelle öffnen ↗',entry.source_url));root.append(tools,rich(entry.body),status);
  const reportSection=el('section','detail-section');reportSection.append(el('h3','','In diesen Wochenberichten'));for(const rel of data.links.filter(l=>l.entry_id===entry.id)){const report=data.reports.find(r=>r.id===rel.report_id);if(report){const details=el('details','report-item');details.append(el('summary','',`${formatDate(report.report_date)} · ${report.title}`),rich(report.body));reportSection.append(details);}}root.append(reportSection);
  const notes=el('section','detail-section'),label=el('label','','Meine Notiz'),textarea=el('textarea');textarea.rows=5;textarea.maxLength=40000;textarea.value=entry.notes;textarea.placeholder='Was möchte ich mir zu dieser Meldung merken?';label.append(textarea);textarea.oninput=()=>notesDirty=textarea.value!==entry.notes;
  notes.append(label,button('Notiz speichern',b=>busy(b,async()=>{const result=await api('update',{id:entry.id,version:entry.version,notes:textarea.value});Object.assign(entry,result.entry);notesDirty=false;render();message(status,'Notiz gespeichert.',true);},status)));root.append(notes);
  const section=el('section','detail-section');section.append(el('h3','','Kommentare'));const commentStatus=el('p');commentStatus.setAttribute('role','status');
  const list=el('div');function drawComments(){list.replaceChildren();const comments=data.comments.filter(c=>c.entry_id===entry.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    for(const c of comments){const row=el('div','comment');row.append(el('small','',formatDate(c.created_at)),el('p','',c.body));const actions=el('div','comment-actions');
      actions.append(button('Bearbeiten',()=>{const edit=el('textarea');edit.rows=4;edit.value=c.body;edit.maxLength=20000;const save=button('Änderung speichern',b=>busy(b,async()=>{await api('comment-update',{id:c.id,version:c.version,body:edit.value});const next=await api('list');data.comments=next.comments;drawComments();render();message(commentStatus,'Kommentar gespeichert.',true);},commentStatus));row.replaceChildren(edit,save,button('Abbrechen',drawComments,'text-button'));},'text-button'),button('Löschen',b=>{if(confirm('Diesen Kommentar löschen?'))busy(b,async()=>{await api('comment-delete',{id:c.id,version:c.version});data.comments=data.comments.filter(x=>x.id!==c.id);drawComments();render();},commentStatus);},'text-button'));row.append(actions);list.append(row);}
  }drawComments();section.append(list);
  const form=el('form'),commentLabel=el('label','','Neuer Kommentar'),input=el('textarea');input.rows=3;input.maxLength=20000;input.required=true;input.placeholder='Deine Einschätzung, eine Frage oder eine Idee …';commentLabel.append(input);const submit=el('button','','Kommentar hinzufügen');submit.type='submit';let pendingId='';
  form.append(commentLabel,submit);form.onsubmit=event=>{event.preventDefault();busy(submit,async()=>{pendingId ||= crypto.randomUUID();await api('comment-add',{id:pendingId,entry_id:entry.id,body:input.value});const next=await api('list');data.comments=next.comments;pendingId='';input.value='';drawComments();render();message(commentStatus,'Kommentar gespeichert.',true);},commentStatus);};section.append(form,commentStatus);root.append(section);
}
function closeDialog(dialog){if(dialog.id==='detail'&&notesDirty&&!confirm('Die Notiz wurde noch nicht gespeichert. Trotzdem schließen?'))return;dialog.close();if(dialog.id==='detail')notesDirty=false;}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDialog(document.getElementById(b.dataset.close)));
$('#detail').addEventListener('cancel',event=>{event.preventDefault();closeDialog($('#detail'));});
window.addEventListener('beforeunload',event=>{if(notesDirty){event.preventDefault();event.returnValue='';}});
$('#reports-open').onclick=()=>{const root=$('#reports-list');root.replaceChildren();for(const r of [...data.reports].sort((a,b)=>b.report_date.localeCompare(a.report_date))){const details=el('details','report-item');details.append(el('summary','',`${formatDate(r.report_date)} · ${r.title}`),rich(r.body));root.append(details);}$('#reports-dialog').showModal();};
$('#import-open').onclick=()=>{$('#import-dialog').showModal();if(!$('#import-date').value)$('#import-date').value=new Date().toLocaleDateString('sv-SE');};
$('#import-form').onsubmit=event=>{event.preventDefault();importReport={title:$('#import-title').value,report_date:$('#import-date').value,body:$('#import-body').value};drafts=splitReport(importReport.body);$('#import-review').hidden=false;renderDrafts();message($('#import-status'),`${drafts.length} Abschnitte erkannt. Bitte prüfen – Einleitung und Schluss können abgewählt werden.`);};
function field(label,value,onChange,kind='input'){const l=el('label','',label),input=el(kind);input.value=value;if(kind==='textarea')input.rows=5;input.addEventListener('input',()=>onChange(input.value));l.append(input);return l;}
function renderDrafts(){const root=$('#import-drafts');root.replaceChildren();drafts.forEach((draft,index)=>{const card=el('div','draft'),top=el('label','check'),check=el('input');check.type='checkbox';check.checked=draft.selected;check.onchange=()=>draft.selected=check.checked;top.append(check,document.createTextNode(`Meldung ${index+1} übernehmen`));const catLabel=el('label','','Kategorie'),select=el('select');categories.forEach(c=>{const option=el('option','',c);option.value=c;select.append(option);});select.value=draft.category;select.onchange=()=>draft.category=select.value;catLabel.append(select);
    card.append(top,field('Titel',draft.title,v=>draft.title=v),catLabel,field('Inhalt',draft.body,v=>draft.body=v,'textarea'),field('Originalquelle (Link)',draft.source_url,v=>draft.source_url=v),field('Schlagwörter, durch Komma getrennt',draft.tags.join(', '),v=>draft.tags=v.split(',').map(x=>x.trim()).filter(Boolean)));root.append(card);});}
$('#add-draft').onclick=()=>{drafts.push(makeDraft());renderDrafts();};
$('#save-import').onclick=()=>busy($('#save-import'),async()=>{if(!importReport)throw new Error('Bitte zuerst den Bericht vorbereiten.');if(importReport.body!==$('#import-body').value||importReport.title!==$('#import-title').value||importReport.report_date!==$('#import-date').value)throw new Error('Der Bericht wurde geändert. Bitte die Meldungen erneut vorbereiten.');const selected=drafts.filter(d=>d.selected);if(!selected.length)throw new Error('Bitte mindestens eine Meldung auswählen.');const result=await api('import',{report:importReport,entries:selected});await load();message($('#import-status'),`Gespeichert: ${result.added} neue Meldungen. Bereits vorhandene Einträge wurden mit dem Bericht verknüpft.`,true);$('#import-review').hidden=true;$('#import-form').reset();drafts=[];importReport=null;},$('#import-status'));
if(token)load().catch(error=>{if(error.status===401)forget();message($('#login-status'),error.message);});
