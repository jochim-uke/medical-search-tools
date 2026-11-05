const base = 'https://tjjtemvclcgqmuhlnumr.supabase.co';
const headers = {apikey:'sb_publishable_ZYbal6vsT-gcmAHu-eugKw_h7Fif-1x', 'Content-Type':'application/json'};
const $ = id => document.getElementById(id);
const sessionKey = 'update-archive-token';
const session = () => sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey) || '';
const fields = ['diseases','methods'];
let entries = [];
const norm = text => String(text).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[‐‑–—]/g,'-');
function node(tag, text, cls) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (cls) element.className = cls;
  return element;
}
async function request(path, options = {}) {
  const response = await fetch(base + path, {cache:'no-store',headers,...options});
  const body = await response.text();
  let result;
  try { result = body ? JSON.parse(body) : null; } catch { throw new Error('Ungültige Serverantwort.'); }
  if (!response.ok) {
    const error = new Error(result?.error || result?.message || 'Anfrage fehlgeschlagen.');
    error.code = result?.code;
    error.status = response.status;
    throw error;
  }
  return result;
}
function vocabulary(field) {
  return [...new Set(entries.flatMap(entry => entry[field]))].sort((a,b) => a.localeCompare(b,'de'));
}
function render() {
  const words = norm($('search').value).trim().split(/\s+/).filter(Boolean);
  const matches = entries.filter(entry => {
    const haystack = norm(['#'+entry.number, entry.title, entry.summary,...entry.methods,...entry.diseases].join(' '));
    return fields.every(field => !$(field).value || entry[field].includes($(field).value)) && words.every(word => haystack.includes(word));
  });
  $('status').textContent = matches.length ? matches.length+' von '+entries.length+' Beiträgen' : 'Keine passenden Beiträge.';
  $('results').replaceChildren(...matches.map(entry => {
    const card = node('article','','ash-card');
    const tags = node('div','','tags');
    for (const field of fields) for (const value of entry[field]) {
      const tag = node('span',value,'tag');
      tag.title = field === 'methods' ? 'Methode / Medikamentenklasse' : 'Erkrankung';
      tags.append(tag);
    }
    const source = node('a','Quelle öffnen ↗');
    source.href = entry.source;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    card.append(node('small','Abstract #'+entry.number),node('h2',entry.title),tags,node('p',entry.summary),source);
    return card;
  }));
}
async function refresh() {
  try {
    const next = [];
    for (let offset=0;; offset+=500) {
      const page = await request('/rest/v1/ash2026_abstracts?select=*&order=number.asc&limit=500&offset='+offset);
      next.push(...page);
      if (page.length < 500) break;
    }
    entries = next;
    for (const field of fields) {
      const select = $(field), previous = select.value;
      const values = vocabulary(field);
      select.length = 1;
      values.forEach(value => select.add(new Option(value,value)));
      select.value = values.includes(previous) ? previous : '';
      $(field === 'methods' ? 'method-options' : 'disease-options').replaceChildren(...values.map(value => new Option(value,value)));
    }
    $('retry').hidden = true;
    render();
  } catch {
    $('status').textContent = 'Beiträge konnten nicht geladen werden. Bitte erneut versuchen.';
    $('retry').hidden = false;
  }
}
function account() {
  $('form').hidden = !session();
  $('login').hidden = Boolean(session());
  $('logout').hidden = !session();
}
function forget() {
  sessionStorage.removeItem(sessionKey);
  localStorage.removeItem(sessionKey);
  account();
}
async function auth(action, body = {}) {
  return request('/functions/v1/update-archive-api',{method:'POST',headers:{...headers,'x-archive-token':session()},body:JSON.stringify({action,...body})});
}
function listInput(value,field) {
  const known = vocabulary(field);
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean).map(item => known.find(tag => norm(tag) === norm(item)) || item))];
}
$('search').oninput = render;
fields.forEach(field => $(field).onchange = render);
$('reset').onclick = () => { ['search',...fields].forEach(field => $(field).value = ''); render(); };
$('retry').onclick = refresh;
$('close').onclick = () => $('editor').close();
$('add').onclick = () => { account(); $('feedback').textContent = ''; $('editor').showModal(); };
$('login').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const password = $('login').elements.password;
    const result = await auth('login',{password:password.value,remember:false});
    sessionStorage.setItem(sessionKey,result.token);
    password.value = '';
    account();
    $('feedback').textContent = '';
  } catch(error) { $('feedback').textContent = error.message; }
  finally {button.disabled = false;}
};
$('logout').onclick = async () => {
  try { await auth('logout'); forget(); }
  catch(error) { if(error.status === 401) forget(); else $('status').textContent = 'Abmeldung fehlgeschlagen. Bitte erneut versuchen.'; }
};
$('form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const entry = Object.fromEntries(new FormData($('form')));
  try {
    for (const field of fields) {
      entry[field] = listInput(entry[field],field);
      if (!entry[field].length || entry[field].length > 20) throw new Error('Bitte je Kategorie 1 bis 20 Begriffe eingeben.');
    }
    entry.number = Number(entry.number);
    await request('/rest/v1/rpc/ash2026_add',{method:'POST',body:JSON.stringify({session_token:session(),entry})});
    $('form').reset();
    $('editor').close();
    [...fields,'search'].forEach(field => $(field).value = '');
    await refresh();
  } catch(error) {
    if (error.code === '42501') forget();
    $('feedback').textContent = error.code === '23505' ? 'Diese Abstractnummer ist bereits gespeichert.' : error.message;
  } finally {button.disabled = false;}
};
account();
refresh();