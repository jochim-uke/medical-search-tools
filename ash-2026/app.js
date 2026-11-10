const base = 'https://tjjtemvclcgqmuhlnumr.supabase.co';
const headers = {apikey:'sb_publishable_ZYbal6vsT-gcmAHu-eugKw_h7Fif-1x', 'Content-Type':'application/json'};
const $ = id => document.getElementById(id);
const sessionKey = 'update-archive-token';
const session = () => sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey) || '';
const fields = ['diseases','methods'];
let entries = [];
let editorMode = 'add';
const savingPriorities = new Set();
const priorityOf = entry => entry.priority || 0;
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
    const priority = $('priority').value;
    return fields.every(field => !$(field).value || entry[field].includes($(field).value)) && words.every(word => haystack.includes(word)) && (priority === '' || (priority === 'any' ? priorityOf(entry) > 0 : priorityOf(entry) === Number(priority)));
  }).sort((a,b) => ($('sort').value === 'priority' ? priorityOf(b)-priorityOf(a) : 0) || a.number-b.number);
  $('status').textContent = matches.length ? matches.length+' von '+entries.length+' Beiträgen' : 'Keine passenden Beiträge.';
  $('results').replaceChildren(...matches.map(entry => {
    const card = node('article','','ash-card');
    card.dataset.priority = priorityOf(entry);
    const tags = node('div','','tags');
    for (const field of fields) for (const value of entry[field]) {
      const tag = node('span',value,'tag');
      tag.title = field === 'methods' ? 'Methode / Medikamentenklasse' : 'Erkrankung';
      tags.append(tag);
    }
    const isAsh = /^https:\/\/onlineprogram\.hematology\.org\/paper-details\.aspx\?pid=\d+$/.test(entry.source);
    const source = node('a',isAsh ? 'Originalabstract bei ASH ↗' : 'Quelle öffnen ↗');
    source.href = entry.source;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    const heading = node('div','','ash-card-heading');
    heading.append(node('small','Abstract #'+entry.number),priorityControl(entry));
    card.append(heading,node('h2',entry.title),tags,node('p',entry.summary),source);
    if (entry.supplementary_source) {
      const additional = node('a','Ergänzende Quelle ↗');
      additional.href = entry.supplementary_source;
      additional.target = '_blank';
      additional.rel = 'noopener noreferrer';
      const paragraph = node('p','');
      paragraph.append(additional);
      card.append(paragraph);
    }
    return card;
  }));
}
function priorityControl(entry) {
  const group = node('div','','ash-priority');
  group.append(node('span','Priorität','priority-caption'));
  if (!session()) {
    group.append(node('span',priorityOf(entry) ? '+'.repeat(priorityOf(entry)) : 'Ohne','priority-readonly'));
    return group;
  }
  const controls = node('div','','priority-control');
  controls.setAttribute('role','group');
  controls.setAttribute('aria-label','Priorität für Abstract #'+entry.number);
  controls.setAttribute('aria-busy',String(savingPriorities.has(entry.number)));
  for (let priority=0; priority<=3; priority++) {
    const label = priority ? '+'.repeat(priority) : '–';
    const button = node('button',label);
    button.type = 'button';
    button.dataset.priorityButton = entry.number+':'+priority;
    button.setAttribute('aria-label',priority ? 'Priorität '+label : 'Keine Priorität');
    button.setAttribute('aria-pressed',String(priorityOf(entry) === priority));
    button.title = priority ? 'Priorität '+label : 'Priorität entfernen';
    button.disabled = savingPriorities.has(entry.number);
    button.onclick = () => savePriority(entry,priority,controls);
    controls.append(button);
  }
  group.append(controls);
  return group;
}
async function savePriority(entry,priority,controls) {
  if (savingPriorities.has(entry.number) || priorityOf(entry) === priority) return;
  savingPriorities.add(entry.number);
  controls.setAttribute('aria-busy','true');
  controls.querySelectorAll('button').forEach(button => button.disabled = true);
  $('priority-feedback').textContent = 'Priorität wird gespeichert …';
  try {
    const saved = await request('/rest/v1/rpc/ash2026_set_priority',{method:'POST',body:JSON.stringify({session_token:session(),abstract_number:entry.number,new_priority:priority,expected_version:entry.priority_version || 0})});
    entries = entries.map(item => item.number === entry.number ? {...item,...saved} : item);
    $('priority-feedback').textContent = 'Abstract #'+entry.number+': '+(priority ? 'Priorität '+ '+'.repeat(priority)+' gespeichert.' : 'Priorität entfernt.');
  } catch(error) {
    if (error.code === '42501') forget();
    if (error.code === '40001') await refresh();
    $('priority-feedback').textContent = error.code === '40001' ? 'Die Priorität wurde auf einem anderen Gerät geändert. Die Ansicht wurde aktualisiert; bitte erneut auswählen.' : 'Priorität nicht gespeichert: '+error.message;
  } finally {
    savingPriorities.delete(entry.number);
    const active = document.activeElement;
    const restoreFocus = controls.contains(active) || active === document.body;
    render();
    if (restoreFocus) {
      const target = document.querySelector('[data-priority-button="'+entry.number+':'+priority+'"]') || $('priority');
      target.focus({preventScroll:true});
    }
  }
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
  $('form').hidden = !session() || editorMode !== 'add';
  $('login').hidden = Boolean(session());
  $('logout').hidden = !session();
  $('manage').hidden = Boolean(session());
  render();
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
$('priority').onchange = render;
$('sort').onchange = render;
$('reset').onclick = () => { ['search',...fields,'priority'].forEach(field => $(field).value = ''); $('sort').value = 'number'; render(); };
$('retry').onclick = refresh;
$('close').onclick = () => $('editor').close();
function openEditor(mode) {
  editorMode = mode;
  $('editor-title').textContent = mode === 'add' ? 'Beitrag hinzufügen' : 'Prioritäten bearbeiten';
  account();
  $('feedback').textContent = '';
  $('editor').showModal();
}
$('add').onclick = () => openEditor('add');
$('manage').onclick = () => openEditor('priority');
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
    if (editorMode === 'priority') {
      $('editor').close();
      $('priority-feedback').textContent = 'Angemeldet. Priorität direkt am Beitrag auswählen.';
    }
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
    [...fields,'search','priority'].forEach(field => $(field).value = '');
    await refresh();
  } catch(error) {
    if (error.code === '42501') forget();
    $('feedback').textContent = error.code === '23505' ? 'Diese Abstractnummer ist bereits gespeichert.' : error.message;
  } finally {button.disabled = false;}
};
account();
refresh();
