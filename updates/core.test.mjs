import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEntries,splitReport} from './core.mjs';
const base={category:'Publikationen',body:'CAR‑T und Bendamustin',source_url:'',tags:['DLBCL'],notes:'',comments:[],clicks:0,priority:0,report_date:'2026-08-11'};
const filters={query:'',category:'',tag:'',from:'',to:'',noted:false,priority:'all',sort:'newest'};
test('search includes notes and comments and normalizes accents and hyphens',()=>{
 const entries=[{...base,id:'a',title:'Ergebnisse',notes:'Für Vortrag merken',comments:[{body:'Sequenzplanung prüfen'}]}];
 for(const query of ['fur vortrag','sequenzplanung','CAR-T','dlbcl'])assert.equal(selectEntries(entries,{...filters,query}).length,1);
 assert.equal(selectEntries(entries,{...filters,query:'unbekannt'}).length,0);
});
test('tag filter is exact, normalized and combines with other filters',()=>{
 const rows=[{...base,id:'a',title:'a',tags:['Axi-cel','ICANS']},{...base,id:'b',title:'b',tags:['Liso-cel']}];
 assert.deepEqual(selectEntries(rows,{...filters,tag:'axi‑cel'}).map(e=>e.id),['a']);
 assert.equal(selectEntries(rows,{...filters,tag:'CAR-T'}).length,0);
});
test('explicit priority outranks clicks or comments; clicks are capped',()=>{
 const rows=[{...base,id:'a',title:'a',priority:1},{...base,id:'b',title:'b',clicks:10000,comments:Array(100).fill({body:'x'})},{...base,id:'c',title:'c',priority:1,clicks:20},{...base,id:'d',title:'d',priority:1,clicks:19,comments:[{body:'x'}]}];
 assert.deepEqual(selectEntries(rows,{...filters,sort:'interest'}).map(e=>e.id),['d','c','a','b']);
});
test('category, date, priority and personal filters combine',()=>{
 const rows=[{...base,id:'a',title:'a',priority:3,notes:'Gedanke'},{...base,id:'b',title:'b',priority:3}];
 assert.deepEqual(selectEntries(rows,{...filters,category:'Publikationen',from:'2026-08-11',to:'2026-08-11',priority:'3',noted:true}).map(e=>e.id),['a']);
 assert.equal(selectEntries(rows,{...filters,from:'2026-08-12'}).length,0);
});
test('import preserves prose as reviewable drafts and discovers source links',()=>{
 const drafts=splitReport('Bericht 11.08.2026\n\n- **Erste Studie:** Inhalt [Quelle](https://pubmed.ncbi.nlm.nih.gov/12345/)\n\n- **Zweite Studie:** mehr Inhalt');
 assert.equal(drafts.length,3);assert.equal(drafts[1].source_url,'https://pubmed.ncbi.nlm.nih.gov/12345/');assert.equal(drafts[1].category,'Publikationen');
});
