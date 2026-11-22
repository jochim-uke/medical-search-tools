const content = document.querySelector('#content');
const status = document.querySelector('#status');
let questions = [];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(label, href, external = false) {
  const node = element('a', label);
  const url = new URL(href, location.href);
  if (!['https:', 'http:'].includes(url.protocol)) return element('span', label);
  node.href = url.href;
  if (external) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}

function date(value) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(value + 'T12:00:00'));
}

function sourceLinks(question, ids) {
  const links = element('p', undefined, 'source-links');
  for (const id of ids) {
    const study = question.studies.find(item => item.id === id);
    if (study) links.append(link(study.title, '#quelle-' + id));
  }
  return links;
}

function section(title) {
  const node = element('section', undefined, 'question-section');
  node.append(element('h2', title));
  return node;
}

function renderIndex() {
  document.title = 'Klinische Fragen · Update-Archiv';
  const list = element('div', undefined, 'question-list');
  for (const question of questions) {
    const card = element('article', undefined, 'panel');
    const title = element('h2');
    title.append(link(question.title, '?frage=' + encodeURIComponent(question.slug)));
    card.append(element('p', 'Stand ' + date(question.updated), 'question-meta'), title,
      element('p', question.answer), element('p', question.tags.join(' · '), 'question-meta'));
    list.append(card);
  }
  content.append(list);
  if (!questions.length) status.textContent = 'Es sind noch keine klinischen Fragen veröffentlicht.';
}

function studyTable(question, studies, caption) {
  const container = element('div', undefined, 'table-scroll');
  const table = element('table', undefined, 'evidence-table');
  table.append(element('caption', caption));
  const headings = ['Studie & Population', 'Nachbeobachtung', 'Wirksamkeit', 'Toxizität & Logistik', 'Einordnung & Quellen'];
  const head = element('thead');
  const headingRow = element('tr');
  for (const label of headings) {
    const cell = element('th', label);
    cell.scope = 'col';
    headingRow.append(cell);
  }
  head.append(headingRow);
  table.append(head);
  const body = element('tbody');
  for (const study of studies) {
    const row = element('tr');
    row.id = 'quelle-' + study.id;
    const first = element('th');
    first.scope = 'row';
    first.dataset.label = headings[0];
    first.append(element('h3', study.title), element('p', study.publication, 'question-meta'), element('p', study.population));
    row.append(first);
    for (const [index, value] of [study.followUp, study.efficacy, study.toxicity, study.limitation].entries()) {
      const cell = element('td');
      cell.dataset.label = headings[index + 1];
      cell.append(element('p', value));
      if (index === 3) {
        const links = element('div', undefined, 'source-links');
        for (const source of study.links) links.append(link(source.label, source.url, true));
        for (const entry of study.archiveEntries) links.append(link(entry.label, '../?entry=' + encodeURIComponent(entry.id)));
        cell.append(links);
      }
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  container.append(table);
  return container;
}

function renderQuestion(question) {
  document.title = question.title + ' · Update-Archiv';
  const intro = element('section', undefined, 'question-intro');
  intro.append(element('p', 'Stand ' + date(question.updated) + ' · KI-kuratiert', 'question-meta'),
    element('h2', question.title, 'question-title'), element('p', question.scope, 'question-meta'));
  const answer = element('div', undefined, 'short-answer');
  answer.append(element('h3', 'Aktuelle Einordnung'), element('p', question.answer), sourceLinks(question, question.answerSources));
  intro.append(answer);
  const navigation = element('div', undefined, 'question-navigation');
  for (const [label, href] of [['Studienvergleich', '#vergleich'], ['Offene Fragen', '#offene-fragen'], ['Änderungsverlauf', '#verlauf']]) {
    navigation.append(link(label, href));
  }
  navigation.append(link('Notizen & Kommentare', '../?entry=' + encodeURIComponent(question.entryId)));
  intro.append(navigation);
  content.append(intro);

  const takeaways = section('Für die klinische Diskussion');
  const cards = element('div', undefined, 'takeaway-grid');
  for (const item of question.takeaways) {
    const card = element('article', undefined, 'panel');
    card.append(element('h3', item.title), element('p', item.text), sourceLinks(question, item.sources));
    cards.append(card);
  }
  takeaways.append(cards);
  content.append(takeaways);

  const evidence = section('Studienvergleich');
  evidence.id = 'vergleich';
  evidence.append(element('p', 'Die HR-Richtung ist bei jedem Ergebnis angegeben. Prozentwerte folgen der jeweils bezeichneten Reihenfolge. DESCAR-T erscheint mit zwei Fassungen derselben Studienfamilie.', 'question-meta'));
  evidence.append(studyTable(question, question.studies.filter(study => study.directSecondLine), 'Direkte Zweitlinienkohorten · Kongressdaten'));
  evidence.append(studyTable(question, question.studies.filter(study => !study.directSecondLine), 'Ergänzende Vollpublikationen · gemischte oder spätere Linien'));
  content.append(evidence);

  const interpretation = section('Wie die Ergebnisse zu lesen sind');
  for (const text of question.interpretation) interpretation.append(element('p', text));
  content.append(interpretation);

  const open = section('Offene Fragen');
  open.id = 'offene-fragen';
  for (const item of question.openQuestions) {
    const card = element('article', undefined, 'open-question');
    card.append(element('h3', item.question), element('p', item.trigger), sourceLinks(question, item.sources));
    open.append(card);
  }
  content.append(open);

  const changes = section('Änderungsverlauf');
  changes.id = 'verlauf';
  for (const change of question.changes) changes.append(element('p', date(change.date) + ' · ' + change.text));
  content.append(changes);
}

async function load() {
  const response = await fetch('./data.json', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Die klinischen Fragen konnten nicht geladen werden. Bitte erneut laden.');
  questions = await response.json();
  status.textContent = '';
  const slug = new URLSearchParams(location.search).get('frage');
  if (!slug) return renderIndex();
  const question = questions.find(item => item.slug === slug);
  if (!question) {
    status.textContent = 'Diese klinische Frage wurde nicht gefunden. Hier stehen die verfügbaren Themen.';
    return renderIndex();
  }
  renderQuestion(question);
  document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

load().catch(error => {
  status.textContent = error.name === 'TimeoutError' ? 'Das Laden dauert zu lange. Bitte erneut laden.' : error.message;
});
