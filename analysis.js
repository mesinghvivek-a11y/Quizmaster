'use strict';
const element=id=>document.getElementById(id);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const subjectId=params.get('s')||'polity';
const unspecified='Unsectioned',unknownYear='Unknown';
let bank,model;
function examName(tag){return String(tag?.family||tag?.label||'').trim();}
function buildCounts(data,exam){
 const sections=new Map(),chapters=new Map(),years=new Set(),totals=new Map();
 const row=name=>({name,counts:new Map(),total:0});
 function chapter(no,name,group){
  const key=String(no??name??'');
  if(!chapters.has(key)){
   const section=String(group||unspecified);
   if(!sections.has(section))sections.set(section,row(section));
   chapters.set(key,{...row(name||'Unspecified chapter'),section});
  }
  return chapters.get(key);
 }
 for(const c of data.chapters||[])chapter(c.no,c.title,c.group);
 function increment(r,year){r.total++;r.counts.set(year,(r.counts.get(year)||0)+1);}
 let matched=0;
 for(const q of data.questions){
  const appearances=new Set();
  for(const tag of q.examTags||[]){
   if(examName(tag)!==exam)continue;
   const valid=[...(Array.isArray(tag.years)?tag.years:[]),tag.year].map(Number).filter(y=>Number.isInteger(y)&&y>=1000&&y<=9999);
   for(const year of valid.length?valid:[unknownYear])appearances.add(year);
  }
  if(!appearances.size)continue;
  matched++;
  const c=chapter(q.chapterNo,q.chapter,q.group);
  for(const year of appearances){
   years.add(year);increment(c,year);increment(sections.get(c.section),year);
   totals.set(year,(totals.get(year)||0)+1);
  }
 }
 const ordered=[...years].filter(y=>y!==unknownYear).sort((a,b)=>b-a);
 if(years.has(unknownYear))ordered.push(unknownYear);
 return {sections,chapters,years:ordered,totals,matched};
}
function table(rows,years,name,heat){
 let peak=0;
 for(const row of rows)for(const value of row.counts.values())peak=Math.max(peak,value);
 const body=rows.map(r=>{
  const cells=years.map(y=>{
   const n=r.counts.get(y)||0,level=heat&&n?Math.ceil(4*n/peak):0;
   return '<td'+(level?' class="heat'+level+'"':'')+'>'+n+'</td>';
  }).join('');
  return '<tr><th scope="row">'+escapeText(r.name)+'</th><td><b>'+r.total+'</b></td>'+cells+'</tr>';
 }).join('');
 return '<table aria-label="'+name+' counts"><thead><tr><th scope="col">'+name+'</th><th scope="col">Total</th>'+years.map(y=>'<th scope="col">'+escapeText(y)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table>';
}
function renderChapters(){
 const select=element('section'),section=select.selectedIndex===0?null:select.value;
 const rows=[...model.chapters.values()].filter(r=>section===null||r.section===section).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 element('chapters').innerHTML=table(rows,model.years,'Chapter',true);
}
function renderExam(){
 model=buildCounts(bank,element('exam').value);
 const sections=[...model.sections.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 const select=element('section'),prior=select.selectedIndex>0?select.value:null;
 select.replaceChildren(new Option('All sections',''),...sections.map(r=>new Option(r.name,r.name)));
 if(prior&&model.sections.has(prior))select.value=prior;
 const total=[...model.totals.values()].reduce((a,b)=>a+b,0);
 element('summary').textContent=model.matched.toLocaleString()+' distinct questions · '+total.toLocaleString()+' recorded appearances in this subject bank.'+(model.totals.has(unknownYear)?' Unknown groups exam tags with no recorded year.':'');
 element('sections').innerHTML=table(sections,model.years,'Section',false);renderChapters();
}
async function load(){
 element('retry').hidden=true;element('summary').textContent='Loading the subject’s exam records…';
 try{
  const published=(await QM.subjects()).find(r=>r.id===subjectId);
  if(published){
   if(published.status!=='live'||!published.path)throw Error('Subject unavailable');
   bank=await QM.bank(published);
  }else if(['history','polity'].includes(subjectId)){
   bank=await QM.deadline(fetch('data/'+subjectId+'.json').then(res=>{if(!res.ok)throw Error('Bank unavailable');return res.json();}),30000);
  }else{
   await QM.deadline(QM.init(2500),10000);bank=QM.isAdmin?await QM.kvGet('subj:'+subjectId):null;
  }
  if(!Array.isArray(bank?.questions))throw Error('Subject unavailable');
  element('subjectName').textContent=bank.title||published?.name||subjectId;
  const exams=[...new Set(bank.questions.flatMap(q=>(q.examTags||[]).map(examName)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const select=element('exam');select.replaceChildren(...exams.map(e=>new Option(e,e)));
  if(!exams.length){select.add(new Option('No examination tags',''));element('summary').textContent='This subject has no questions with examination metadata.';return;}
  if(exams.includes(params.get('exam')))select.value=params.get('exam');
  select.disabled=false;renderExam();element('results').hidden=false;
 }catch{element('summary').textContent='This subject’s question bank could not be loaded.';element('retry').hidden=false;}
}
try{document.body.classList.toggle('dark',(localStorage.getItem('pq-theme')|| (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark');}catch{}
element('back').href='builder.html?s='+encodeURIComponent(subjectId);
element('exam').onchange=renderExam;element('section').onchange=renderChapters;element('retry').onclick=load;load();
