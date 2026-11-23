/* Quiz Master shared layer: Supabase auth + cross-device sync + realtime rooms. Works without config (guest/offline mode). */
(function(){
const C=window.QM_CONFIG||{},enabled=!!(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY&&!/YOUR_/.test(C.SUPABASE_URL+C.SUPABASE_ANON_KEY));
const SBJS='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let sb=null,dbp=null,timer=null;const last=new Map(),cbs=[],emit=e=>cbs.forEach(f=>{try{f(e)}catch(x){}});
const QM=window.QM={enabled,user:null,isAdmin:false,listen:f=>cbs.push(f),client:()=>sb};
// A restored Safari tab can retain a connection which never dispatches another event.
function deadline(promise,ms,onTimeout){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{
  onTimeout?.();reject(new Error('Request timed out'));
 },ms)})]).finally(()=>clearTimeout(timer));
}
QM.deadline=deadline;
function connect(){
 if(dbp)return dbp;
 let expired=false;
 const opened=new Promise((resolve,reject)=>{
  const req=indexedDB.open('quizmaster',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv')};
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result;
   if(expired){db.close();return;}
   db.onclose=db.onversionchange=()=>{db.close();if(dbp===pending)dbp=null};
   resolve(db);
  };
 });
 const pending=deadline(opened,2500,()=>{expired=true}).catch(e=>{if(dbp===pending)dbp=null;throw e});
 dbp=pending;return pending;
}
async function readStore(fn){
 for(let attempt=0;attempt<2;attempt++){
  let db,transaction;
  try{
   db=await connect();
   return await deadline(new Promise((resolve,reject)=>{
    transaction=db.transaction('kv','readonly');
    const request=fn(transaction.objectStore('kv'));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onerror=transaction.onabort=()=>reject(transaction.error||new Error('Storage interrupted'));
   }),3000,()=>{try{transaction?.abort()}catch{}});
  }catch(e){if(db){db.close();dbp=null}if(attempt)throw e;}
 }
}
QM.readStore=readStore;
async function tx(mode,fn){
 if(mode==='readonly')return readStore(fn);
 const db=await connect();
 let transaction;
 return deadline(new Promise((resolve,reject)=>{
  transaction=db.transaction('kv',mode);
  const q=fn(transaction.objectStore('kv'));
  transaction.oncomplete=()=>resolve(q?.result);transaction.onerror=transaction.onabort=()=>reject(transaction.error);
 }),10000,()=>{try{transaction?.abort()}catch{}db.close();dbp=null});
}
addEventListener('pagehide',()=>{const pending=dbp;dbp=null;pending?.then(db=>db.close(),()=>{})});
const LM=()=>{try{return JSON.parse(localStorage.getItem('qm-lm')||'{}')}catch(e){return{}}},setLM=(k,t)=>{try{const m=LM();m[k]=t||Date.now();localStorage.setItem('qm-lm',JSON.stringify(m))}catch(e){}};
QM.kvGet=async k=>{const v=await tx('readonly',s=>s.get(k));return v===undefined?null:v};
QM.kvSet=async(k,v)=>{await tx('readwrite',s=>s.put(v,k));setLM(k);dirty()};QM.touch=k=>{setLM(k);dirty()};
QM.kvDel=k=>tx('readwrite',s=>s.delete(k));
QM.kvKeys=async p=>((await tx('readonly',s=>s.getAllKeys()))||[]).filter(k=>k.startsWith(p));
// Wrap prose at the reader's available width while retaining lists and table rows.
QM.readingText=value=>{
 const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
 const structural=/^(?:\(?\d{1,2}[.)]|\([a-zivx]{1,5}\)|[A-D][.)]|[•▪●]|[-–]\s|(?:Assertion|Reason|Statement\s*\d+|Relationship|Option\s+[A-F]|Study note|Source|Answer key|Explanation|Code[s]?|List[-\s]+[I12]+)\s*[:(—.–])/i;
 let out='',previous='',blank=false;
 for(const raw of lines){
  const line=raw.trim();if(!line){blank=true;continue;}
  const table=s=>/\t| {3,}|\|/.test(s);
  const boundary=structural.test(line)||table(line)||table(previous)||/[:：]$/.test(previous);
  out+=(out?(blank?'\n\n':boundary?'\n':' '):'')+line;blank=false;previous=line;
 }
 return out;
};
QM.studyHTML=(text,escape)=>{
 const paragraphs=QM.readingText(text).split(/\n\s*\n/);
 return paragraphs.map(p=>{
  const match=/^(Study note|Source|Explanation|Answer key):\s*([\s\S]*)$/i.exec(p);
  if(!match)return '<div class="studyBlock">'+escape(p)+'</div>';
  return '<div class="studyBlock'+(match[1]==='Study note'?' studyNote':'')+'"><b>'+escape(match[1])+'</b> '+escape(match[2])+'</div>';
 }).join('');
};
QM.bookmarkPrefix=id=>'bookmark:'+encodeURIComponent(id)+':';
QM.bookmarkKey=(sid,id)=>QM.bookmarkPrefix(sid)+encodeURIComponent(id);
QM.makeBookmark=(subject,q,ts=Date.now())=>({
 ts,sid:subject.id,subject:subject.name,id:q.id,number:q.number,chapter:q.chapter,
 prompt:q.prompt,options:q.options,images:q.images,correct:q.correct,explanation:q.explanation
});
QM.legacyFlags=id=>{
 try{const draft=JSON.parse(localStorage.getItem(id==='polity'?'pq-state-v2':'qm-state:'+id));
  if(draft?.x?.account&&draft.x.account!==QM.user?.id)return [];
  return Array.isArray(draft?.f)?draft.f:[];
 }catch{return []}
};
QM.importFlags=async(subject,questions,legacy)=>{
 const byId=new Map(questions.map(q=>[q.id,q]));
 for(const id of legacy){const key=QM.bookmarkKey(subject.id,id),q=byId.get(id);
  if(q&&!await QM.kvGet(key))await QM.kvSet(key,QM.makeBookmark(subject,q,1));
 }
};
async function all(){const o={};for(const k of await QM.kvKeys('')){if(/^(cache|bank|subj):/.test(k))continue;o[k]=await QM.kvGet(k)}try{Object.keys(localStorage).filter(k=>/^(pq-state|qm-state)/.test(k)).forEach(k=>o['ls:'+k]=localStorage.getItem(k))}catch(e){}return o}
QM.all=all;
async function put(k,v){if(k.startsWith('ls:')){try{localStorage.setItem(k.slice(3),v)}catch(e){}}else await tx('readwrite',s=>s.put(v,k))}
QM.put=put;
const merge=(k,l,r,rt)=>{if(l==null)return r;if(r==null)return l;if(k.startsWith('bookmark:'))return r.ts>l.ts?r:l;if(/^(notes|nts):/.test(k))return rt>(LM()[k]||0)?r:l;
 if(k==='sessions'){const m=new Map(l.map(x=>[x.id,x]));r.forEach(x=>{const o=m.get(x.id);if(!o||(x.en||0)>(o.en||0))m.set(x.id,x)});return[...m.values()]}
 if(k.startsWith('qs:')){const o={...l};for(const i in r)if(!o[i]||(r[i].t||0)>(o[i].t||0))o[i]=r[i];return o}
 if(k==='daily'){const o={...l};for(const d in r)o[d]=Math.max(o[d]||0,r[d]);return o}
 if(k.startsWith('ls:')){const n=s=>{try{return JSON.parse(s).a.length}catch(e){return 0}};return n(r)>n(l)?r:l}
 if(k==='prefs')return{...r,...l};
 return l};
async function pull(){const uid=QM.user.id,lpk='qm-lp:'+uid;let q=sb.from('user_data').select('k,v,updated_at').not('k','like','subj:%');const lp=localStorage.getItem(lpk);if(lp)q=q.gt('updated_at',lp);
 const{data,error}=await q;if(error)return false;const loc=await all();let ch=0,mx=lp?Date.parse(lp):0;
 for(const r of data){const rt=Date.parse(r.updated_at)||0;if(rt>mx)mx=rt;const m=merge(r.k,loc[r.k],r.v,rt);if(JSON.stringify(m)!==JSON.stringify(loc[r.k])){await put(r.k,m);if(/^(notes|nts):/.test(r.k))setLM(r.k,rt);ch++}}
 if(mx)localStorage.setItem(lpk,new Date(mx).toISOString());await push();return ch>0}
const hs=t=>{let h=5381;for(let i=0;i<t.length;i++)h=(h*33^t.charCodeAt(i))>>>0;return t.length+':'+h};
async function push(){if(!sb||!QM.user)return;const pk='qm-ph:'+QM.user.id;let PH={};try{PH=JSON.parse(localStorage.getItem(pk)||'{}')}catch(e){}const loc=await all(),rows=[],hh={};
 for(const k in loc){const h=hs(JSON.stringify(loc[k]));if(PH[k]!==h){hh[k]=h;rows.push({user_id:QM.user.id,k,v:loc[k],updated_at:new Date().toISOString()})}}
 for(let i=0;i<rows.length;i+=10){const{error}=await sb.from('user_data').upsert(rows.slice(i,i+10));if(error){emit('sync:error');return}rows.slice(i,i+10).forEach(r=>PH[r.k]=hh[r.k]);localStorage.setItem(pk,JSON.stringify(PH))}emit('sync:ok')}
function dirty(){if(!QM.user)return;clearTimeout(timer);timer=setTimeout(push,4000)}QM.dirty=dirty;QM.push=push;
function mk(){sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{global:{fetch:(url,init)=>fetch(url,{...init,cache:'no-store'})},realtime:{params:{eventsPerSecond:40}}})}
let loadingClient;
QM.load=()=>{
 if(sb)return Promise.resolve();
 if(!loadingClient)loadingClient=new Promise((resolve,reject)=>{
  const ready=()=>{try{if(!sb)mk();resolve()}catch(e){reject(e)}};
  if(window.supabase)return ready();
  const script=document.createElement('script');script.src=SBJS;
  script.onload=ready;script.onerror=reject;document.head.append(script);
 }).finally(()=>{loadingClient=null});
 return loadingClient;
};
async function flushRq(){let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}if(!q.length)return;const{error}=await sb.from('reports').insert(q);if(!error)localStorage.removeItem('qm-rq')}
async function after(){const{data}=await sb.from('profiles').select('is_admin').maybeSingle();QM.isAdmin=!!(data&&data.is_admin);const ch=await pull();flushRq();emit('auth');if(ch)emit('pulled')}
QM.init=async(w=2500)=>{if(!enabled)return;if(!QM.inited){QM.inited=1;try{await Promise.race([QM.load(),new Promise((_,j)=>setTimeout(j,4000))])}catch(e){QM.inited=0;return}
 const{data}=await sb.auth.getSession();QM.user=data.session?data.session.user:null;
 sb.auth.onAuthStateChange((ev,s)=>{const u=s?s.user:null,was=QM.user;QM.user=u;if(u&&(!was||was.id!==u.id))setTimeout(after,0);if(!u&&was){QM.isAdmin=false;emit('auth')}});
 if(QM.user)QM.ready=after()}
 if(QM.ready&&w)await Promise.race([QM.ready,new Promise(r=>setTimeout(r,w))])};
QM.signIn=async()=>{await QM.load();await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname+location.search}})};
QM.signOut=async()=>{await sb.auth.signOut();QM.user=null;emit('auth')};
QM.report=async r=>{if(QM.user&&sb){const{error}=await sb.from('reports').insert(r);if(!error)return true}let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}q.push(r);localStorage.setItem('qm-rq',JSON.stringify(q));return false};
QM.subjects=async()=>{const ck='cache:subjects';if(!enabled)return[];try{await Promise.race([QM.load(),new Promise((_,j)=>setTimeout(j,4000))]);const r=await Promise.race([sb.from('subjects').select('*').order('sort').order('created_at'),new Promise((_,j)=>setTimeout(j,5000))]);if(r.error)throw r.error;await tx('readwrite',s=>s.put(r.data,ck)).catch(()=>{});return r.data}catch(e){return(await QM.kvGet(ck))||[]}};
QM.bank=async (row,onStale)=>{const k='bank:'+row.id,c=await QM.kvGet(k);const revision=JSON.stringify([row.path,row.version,row.updated_at]);if(c&&c.revision===revision)return c.data;try{const r=await deadline(fetch(C.SUPABASE_URL+'/storage/v1/object/public/banks/'+row.path+'?v='+encodeURIComponent(revision),{cache:'no-store'}),c?5000:20000);if(!r.ok)throw 0;const data=await deadline(r.json(),c?5000:20000);await tx('readwrite',s=>s.put({revision,data},k)).catch(()=>{});return data}catch(e){if(c){if(onStale)onStale();return c.data}throw e}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)emit('resume')});addEventListener('pageshow',e=>{if(e.persisted)emit('resume')});
})();
