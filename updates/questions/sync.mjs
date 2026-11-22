// Emit the archive snapshot SQL from the same content used by the question page.
// Execute through the authorized database connection after publishing the page.
import {readFile} from 'node:fs/promises';

const questions = JSON.parse(await readFile(new URL('./data.json', import.meta.url), 'utf8'));
const base = 'https://jochim-uke.github.io/medical-search-tools/updates/questions/';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

function body(question) {
  const sections = [
    question.scope,
    '**Aktuelle Einordnung**\n' + question.answer,
    ...question.takeaways.map(item => '**' + item.title + '**\n' + item.text),
    '**Studienvergleich**',
    ...question.studies.map(study => [
      '**' + study.title + '**', study.publication, study.population,
      study.followUp, study.efficacy, study.toxicity, study.limitation,
      ...study.links.map(source => '[' + source.label + '](' + source.url + ')')
    ].join('\n')),
    '**Methodische Einordnung**\n' + question.interpretation.join('\n\n'),
    '**Offene Fragen**\n' + question.openQuestions.map(item => item.question + '\n' + item.trigger).join('\n\n'),
    '**Änderungsverlauf**\n' + question.changes.map(change => change.date + ' · ' + change.text).join('\n')
  ];
  return sections.join('\n\n');
}

console.log('begin;');
for (const question of questions) {
  const values = [question.entryId, question.title, 'Klinische Fragen', body(question), base + '?frage=' + encodeURIComponent(question.slug)];
  const tags = 'ARRAY[' + question.tags.map(quote).join(',') + ']::text[]';
  console.log(`insert into public.ua_entries (id,title,category,body,source_url,tags,report_date)
values (${values.map(quote).join(',')},${tags},${quote(question.updated)}::date)
on conflict (id) do update set title=excluded.title,body=excluded.body,
  source_url=excluded.source_url,tags=excluded.tags,report_date=excluded.report_date,
  version=public.ua_entries.version+1
where public.ua_entries.category='Klinische Fragen'
  and public.ua_entries.report_date<=excluded.report_date
  and (public.ua_entries.title,public.ua_entries.body,public.ua_entries.source_url,public.ua_entries.tags,public.ua_entries.report_date)
    is distinct from (excluded.title,excluded.body,excluded.source_url,excluded.tags,excluded.report_date);`);
}
console.log('commit;');
