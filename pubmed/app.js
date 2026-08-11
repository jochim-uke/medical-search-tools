const DISEASES=[
  ["AML",['"acute myeloid leukemia"[tiab]','AML[tiab]']], ["ALL",['"acute lymphoblastic leukemia"[tiab]','ALL[tiab]']], ["CLL",['"chronic lymphocytic leukemia"[tiab]','CLL[tiab]']], ["CML",['"chronic myeloid leukemia"[tiab]','CML[tiab]']],
  ["Multiples Myelom",['"multiple myeloma"[tiab]','myeloma[tiab]']], ["MDS",['"myelodysplastic syndrome"[tiab]','"myelodysplastic syndromes"[tiab]','MDS[tiab]','myelodysplasia[tiab]']], ["MPN",['"myeloproliferative neoplasms"[tiab]','MPN[tiab]','"polycythemia vera"[tiab]','"essential thrombocythemia"[tiab]','myelofibrosis[tiab]']],
  ["DLBCL / High-grade B-NHL",['DLBCL[tiab]','"diffuse large B-cell lymphoma"[tiab]','"high-grade B-cell lymphoma"[tiab]']], ["ZNS-Lymphom",['"central nervous system lymphoma"[tiab]','"CNS lymphoma"[tiab]']], ["T-Zell-Lymphom (breit)",['"T-cell lymphoma"[tiab]','"T cell lymphoma"[tiab]']], ["B-Zell-Lymphom (breit)",['"B-cell lymphoma"[tiab]','"non-Hodgkin lymphoma"[tiab]']],
  ["Follikuläres Lymphom",['"follicular lymphoma"[tiab]']], ["Mantelzelllymphom",['"mantle cell lymphoma"[tiab]']], ["Marginalzonenlymphom",['"marginal zone lymphoma"[tiab]']], ["PTCL / ALCL",['"peripheral T-cell lymphoma"[tiab]','PTCL[tiab]','"anaplastic large cell lymphoma"[tiab]','ALCL[tiab]']], ["Burkitt-Lymphom",['"Burkitt lymphoma"[tiab]']], ["PMBCL",['"primary mediastinal B-cell lymphoma"[tiab]','PMBCL[tiab]']],
  ["Hodgkin-Lymphom",['"Hodgkin lymphoma"[tiab]','"Hodgkin disease"[tiab]']], ["MF / Sézary",['"cutaneous T-cell lymphoma"[tiab]','CTCL[tiab]','"Sézary syndrome"[tiab]']], ["LPL / Waldenström",['"lymphoplasmacytic lymphoma"[tiab]','"Waldenstrom macroglobulinemia"[tiab]']], ["Haarzellleukämie",['"hairy cell leukemia"[tiab]']], ["BPDCN",['"blastic plasmacytoid dendritic cell neoplasm"[tiab]','BPDCN[tiab]']],
  ["Aplastische Anämie",['"aplastic anemia"[tiab]']], ["PNH",['"paroxysmal nocturnal hemoglobinuria"[tiab]','PNH[tiab]']], ["ITP / TTP / HLH",['"immune thrombocytopenia"[tiab]','ITP[tiab]','"thrombotic thrombocytopenic purpura"[tiab]','TTP[tiab]','"hemophagocytic lymphohistiocytosis"[tiab]','HLH[tiab]']], ["Sichelzellkrankheit / Thalassämie / Hämophilie",['"sickle cell disease"[tiab]','thalassemia[tiab]','hemophilia[tiab]']]
];
const TOP=["N Engl J Med","Lancet","Lancet Oncol","Lancet Haematol","JAMA","JAMA Oncol","J Clin Oncol","Nat Med","Nature","Science","Cell","Cancer Cell","Cancer Discov","Clin Cancer Res","Ann Oncol","Nat Cancer","Nat Rev Clin Oncol","Sci Transl Med","J Exp Med","Cancer Res","Cancers (Basel)","Blood"];
const LOW=["Blood Adv","HemaSphere","Haematologica","Leukemia","Am J Hematol","Br J Haematol","Eur J Haematol","Ann Hematol","Bone Marrow Transplant","J Hematol Oncol","Exp Hematol Oncol","Leuk Lymphoma","Leuk Res","Acta Haematol","Blood Rev","Blood Cancer J","Front Immunol","J Thromb Haemost","Transplant Cell Ther","Hematological Oncology","Clin Lymphoma Myeloma Leuk"];
const groups={diseases:{items:DISEASES,container:"disease-list",summary:"disease-summary",selection:"disease-selection",all:"Gesamte Hämatologie"},top:{items:TOP,container:"top-list",summary:"top-summary",selection:"top-selection",all:"Alle Top-Tier Journale"},low:{items:LOW,container:"low-list",summary:"low-summary",selection:"low-selection",all:"Alle Low-Tier Journale"}};

function render(name){const group=groups[name];document.querySelector(`#${group.container}`).innerHTML=group.items.map((item,index)=>{const label=Array.isArray(item)?item[0]:item;return `<label><input type="checkbox" data-group="${name}" data-index="${index}" checked> <span>${label}</span></label>`}).join("")}
function checked(name){return [...document.querySelectorAll(`input[data-group="${name}"]:checked`)]}
function updateSummary(name){const group=groups[name],count=checked(name).length,total=group.items.length;document.querySelector(`#${group.summary}`).textContent=`${count} von ${total} ausgewählt`;document.querySelector(`#${group.selection}`).textContent=count===total?`${group.all} (${total})`:count===0?"Keine Auswahl":`${count} ausgewählt`}
function orBlock(tokens){return `(\n  ${tokens.join(" OR\n  ")}\n)`}
function generate(){
  const diseaseTokens=checked("diseases").flatMap(box=>DISEASES[Number(box.dataset.index)][1]);
  const journalTokens=[...checked("top").map(box=>TOP[Number(box.dataset.index)]),...checked("low").map(box=>LOW[Number(box.dataset.index)])].map(j=>`"${j}"[jour]`);
  const parts=[];
  if(diseaseTokens.length)parts.push(orBlock(diseaseTokens));
  const study=document.querySelector('input[name="study"]:checked').value;
  const trials=orBlock(['clinical trial[ptyp]','randomized controlled trial[ptyp]','"phase 1"[tiab]','"phase I"[tiab]','"phase 2"[tiab]','"phase II"[tiab]','"phase 3"[tiab]','"phase III"[tiab]','randomized[tiab]','randomised[tiab]','"controlled trial"[tiab]','"first-in-human"[tiab]','"proof-of-concept"[tiab]']);
  let negative="";
  if(study==="trials_no_meta"){parts.push(trials);negative='\nNOT (Review[pt] OR Systematic Review[pt] OR Meta-Analysis[pt])'}
  if(study==="trials_with_meta"){parts.push(trials);negative='\nNOT (Review[pt] OR Systematic Review[pt])'}
  if(study==="reviews")parts.push('(Review[pt] OR Systematic Review[pt] OR Meta-Analysis[pt])');
  if(journalTokens.length)parts.push(orBlock(journalTokens));
  const days=document.querySelector('input[name="days"]:checked').value;parts.push(`("last ${days} days"[dp])`);
  document.querySelector("#query").value=parts.join("\nAND\n")+negative;
}
Object.keys(groups).forEach(name=>{render(name);updateSummary(name)});
document.querySelectorAll("[data-toggle]").forEach(button=>button.addEventListener("click",()=>{const panel=document.querySelector(`#${button.dataset.toggle}`),open=panel.hidden;panel.hidden=!open;button.setAttribute("aria-expanded",String(open));button.querySelector(":scope > span:last-child").textContent=open?"−":"+"}));
document.querySelectorAll("[data-select]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(`input[data-group="${button.dataset.select}"]`).forEach(box=>box.checked=button.dataset.value==="all");updateSummary(button.dataset.select);generate()}));
document.querySelector("#search-builder").addEventListener("change",event=>{if(event.target.dataset.group)updateSummary(event.target.dataset.group);generate()});
document.querySelector("#regenerate").addEventListener("click",()=>{generate();document.querySelector("#status").textContent="Query wurde neu generiert."});
document.querySelector("#copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(document.querySelector("#query").value);document.querySelector("#status").textContent="Query wurde kopiert."}catch{document.querySelector("#query").select();document.querySelector("#status").textContent="Query ist markiert und kann kopiert werden."}});
document.querySelector("#search-builder").addEventListener("submit",event=>{event.preventDefault();const term=document.querySelector("#query").value.replace(/\s+/g," ").trim();window.open(`https://pubmed.ncbi.nlm.nih.gov/?${new URLSearchParams({term,sort:"date"})}`,"_blank","noopener")});
generate();
