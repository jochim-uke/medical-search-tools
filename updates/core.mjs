export const categories=['Publikationen','Kongressbeiträge','Zulassungsrelevante News','Pressemitteilungen','Sonstige'];
export const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[‐‑–—]/g,'-').toLowerCase();
export const plain=value=>String(value||'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*#]/g,'').replace(/^[-•]\s/gm,'');
export const interest=entry=>3*(entry.comments?.length||0)+Math.min(entry.clicks||0,20);
export function searchText(entry){return normalize([entry.title,entry.body,entry.source_url,...entry.tags,entry.notes,...entry.comments.map(c=>c.body)].join(' '));}
export function selectEntries(entries,filters){
  const terms=normalize(filters.query).split(/\s+/).filter(Boolean);
  const rows=entries.filter(e=>(!filters.category||e.category===filters.category)&&(!filters.from||e.report_date>=filters.from)&&(!filters.to||e.report_date<=filters.to)&&(!filters.noted||e.notes.trim()||e.comments.length)&&(filters.priority==='all'||(filters.priority==='marked'?e.priority>0:e.priority===Number(filters.priority)))&&terms.every(t=>searchText(e).includes(t)));
  const relevance=e=>terms.reduce((sum,t)=>sum+(normalize(e.title).includes(t)?5:0)+(normalize(e.tags.join(' ')).includes(t)?3:0)+(normalize(e.notes+' '+e.comments.map(c=>c.body).join(' ')).includes(t)?2:0),0);
  rows.sort((a,b)=>{
    if(filters.sort==='interest'){const d=b.priority-a.priority||interest(b)-interest(a);if(d)return d;}
    if(filters.sort==='relevance'){const d=relevance(b)-relevance(a);if(d)return d;}
    return (filters.sort==='oldest'?a.report_date.localeCompare(b.report_date):b.report_date.localeCompare(a.report_date))||a.title.localeCompare(b.title,'de');
  });return rows;
}
export function guessCategory(value){const s=normalize(value);if(/pmid|pubmed|journal|publikation/.test(s))return categories[0];if(/zulassung|fda|ema\b|chmp/.test(s))return categories[2];if(/kongress|abstract|ash\b|eha\b|asco\b/.test(s))return categories[1];if(/pressemitteilung|press release/.test(s))return categories[3];return categories[4];}
export function splitReport(value){
  const lines=value.trim().split('\n'); const blocks=[];let current=[];
  const flush=()=>{const b=current.join('\n').trim();if(b)blocks.push(b);current=[];};
  for(const line of lines){if(/^(?:#{1,4}\s|[-*•]\s|\d+[.)]\s|\*\*[^*]+\*\*\s*$)/.test(line.trim())&&current.length)flush();current.push(line);}flush();
  if(blocks.length===1)return value.split(/\n\s*\n/).filter(b=>b.trim()).map(makeDraft);
  return blocks.map(makeDraft);
}
export function makeDraft(body=''){
  const title=plain(body.split('\n').find(l=>l.trim())||'Neue Meldung').replace(/^\d+[.)]\s*/,'').split(/:\s/)[0].slice(0,200);
  const url=body.match(/https?:\/\/[^\s)\]>]+/)?.[0]||'';
  return {title,body,source_url:url,category:guessCategory(body),tags:[],selected:true};
}
