/* Quiz Master shared layer: Supabase auth + cross-device sync + realtime rooms. Works without config (guest/offline mode). */
(function(){
const C=window.QM_CONFIG||{},enabled=!!(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY&&!/YOUR_/.test(C.SUPABASE_URL+C.SUPABASE_ANON_KEY));
const SBJS='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let sb=null,dbp=null,timer=null;const last=new Map(),cbs=[],emit=e=>cbs.forEach(f=>{try{f(e)}catch(x){}});
const QM=window.QM={enabled,user:null,isAdmin:false,listen:f=>cbs.push(f),client:()=>sb};
const idb=()=>dbp||(dbp=new Promise(r=>{try{const q=indexedDB.open('quizmaster',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const d=q.result;d.onclose=d.onversionchange=()=>{try{d.close()}catch(e){}dbp=null};r(d)};q.onerror=()=>{dbp=null;r(null)}}catch(e){r(null)}}));
const tx=async(m,fn,again)=>{const d=await idb();if(!d)return null;try{return await new Promise(r=>{const t=d.transaction('kv',m),q=fn(t.objectStore('kv'));t.oncomplete=()=>r(q&&q.result);t.onerror=t.onabort=()=>r(null)})}catch(e){dbp=null;return again?null:tx(m,fn,1)}};
const LM=()=>{try{return JSON.parse(localStorage.getItem('qm-lm')||'{}')}catch(e){return{}}},setLM=(k,t)=>{try{const m=LM();m[k]=t||Date.now();localStorage.setItem('qm-lm',JSON.stringify(m))}catch(e){}};
QM.kvGet=async k=>{const v=await tx('readonly',s=>s.get(k));return v===undefined?null:v};
QM.kvSet=async(k,v)=>{await tx('readwrite',s=>s.put(v,k));setLM(k);dirty()};QM.touch=k=>{setLM(k);dirty()};
QM.kvDel=k=>tx('readwrite',s=>s.delete(k));
QM.kvKeys=async p=>((await tx('readonly',s=>s.getAllKeys()))||[]).filter(k=>k.startsWith(p));
async function all(){const o={};for(const k of await QM.kvKeys('')){if(/^(cache|bank|subj):/.test(k))continue;o[k]=await QM.kvGet(k)}try{Object.keys(localStorage).filter(k=>/^(pq-state|qm-state)/.test(k)).forEach(k=>o['ls:'+k]=localStorage.getItem(k))}catch(e){}return o}
QM.all=all;
async function put(k,v){if(k.startsWith('ls:')){try{localStorage.setItem(k.slice(3),v)}catch(e){}}else await tx('readwrite',s=>s.put(v,k))}
QM.put=put;
const merge=(k,l,r,rt)=>{if(l==null)return r;if(r==null)return l;if(/^(notes|nts):/.test(k))return rt>(LM()[k]||0)?r:l;
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
function mk(){sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{realtime:{params:{eventsPerSecond:40}}})}
QM.load=()=>sb?Promise.resolve():new Promise((res,rej)=>{if(window.supabase){mk();return res()}const s=document.createElement('script');s.src=SBJS;s.onload=()=>{mk();res()};s.onerror=rej;document.head.append(s)});
async function flushRq(){let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}if(!q.length)return;const{error}=await sb.from('reports').insert(q);if(!error)localStorage.removeItem('qm-rq')}
async function after(){const{data}=await sb.from('profiles').select('is_admin').maybeSingle();QM.isAdmin=!!(data&&data.is_admin);const ch=await pull();flushRq();emit('auth');if(ch)emit('pulled')}
QM.init=async(w=2500)=>{if(!enabled)return;if(!QM.inited){QM.inited=1;try{await Promise.race([QM.load(),new Promise((_,j)=>setTimeout(j,4000))])}catch(e){QM.inited=0;return}
 const{data}=await sb.auth.getSession();QM.user=data.session?data.session.user:null;
 sb.auth.onAuthStateChange((ev,s)=>{const u=s?s.user:null,was=QM.user;QM.user=u;if(u&&(!was||was.id!==u.id))setTimeout(after,0);if(!u&&was){QM.isAdmin=false;emit('auth')}});
 if(QM.user)QM.ready=after()}
 if(QM.ready&&w)await Promise.race([QM.ready,new Promise(r=>setTimeout(r,w))])};
QM.signIn=async()=>{await QM.load();await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}})};
QM.signOut=async()=>{await sb.auth.signOut();QM.user=null;emit('auth')};
QM.report=async r=>{if(QM.user&&sb){const{error}=await sb.from('reports').insert(r);if(!error)return true}let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}q.push(r);localStorage.setItem('qm-rq',JSON.stringify(q));return false};
QM.subjects=async()=>{const ck='cache:subjects';if(!enabled)return[];try{await Promise.race([QM.load(),new Promise((_,j)=>setTimeout(j,4000))]);const r=await Promise.race([sb.from('subjects').select('*').order('sort').order('created_at'),new Promise((_,j)=>setTimeout(j,5000))]);if(r.error)throw r.error;await tx('readwrite',s=>s.put(r.data,ck));return r.data}catch(e){return(await QM.kvGet(ck))||[]}};
QM.bank=async row=>{const k='bank:'+row.id,c=await QM.kvGet(k);if(c&&c.v===row.version)return c.data;try{const r=await fetch(C.SUPABASE_URL+'/storage/v1/object/public/banks/'+row.path+'?v='+row.version);if(!r.ok)throw 0;const data=await r.json();await tx('readwrite',s=>s.put({v:row.version,data},k));return data}catch(e){if(c)return c.data;throw e}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)emit('resume')});addEventListener('pageshow',e=>{if(e.persisted)emit('resume')});
/* PeerJS-compatible shim over Supabase Realtime (broadcast + presence): no public relays, no size cap on rooms */
const rid=()=>Math.random().toString(36).slice(2,10);
window.Peer=function(hostId){const me=hostId||rid(),ev={},self=this,em=(e,a)=>(ev[e]||[]).forEach(f=>f(a));let ch=null;
 self.on=(e,f)=>{(ev[e]=ev[e]||[]).push(f)};self.destroy=()=>{try{ch&&sb.removeChannel(ch)}catch(e){}};
 const open=room=>ch=sb.channel('qm:'+room.replace(/^qm-/,''),{config:{broadcast:{self:false,ack:false},presence:{key:me}}});
 const conn=send=>{const h={};return{on:(e,f)=>{(h[e]=h[e]||[]).push(f)},emit:(e,a)=>(h[e]||[]).forEach(f=>f(a)),send}};
 if(hostId){const c=open(hostId),cs={};
  self.bc=m=>c.send({type:'broadcast',event:'m',payload:{to:'*',msg:m}});
  c.on('broadcast',{event:'m'},({payload:p})=>{if(p.to!=='host')return;let k=cs[p.from];if(!k){k=cs[p.from]=conn(m=>c.send({type:'broadcast',event:'m',payload:{to:p.from,msg:m}}));em('connection',k)}k.emit('data',p.msg)});
  c.on('presence',{event:'leave'},({key})=>{const k=cs[key];if(k){delete cs[key];k.emit('close')}});
  c.subscribe(s=>{if(s==='SUBSCRIBED')setTimeout(async()=>{const st=c.presenceState();if(Object.keys(st).some(k=>k!==me&&st[k].some(x=>x.host))){em('error',{type:'unavailable-id'});return}await c.track({host:1});em('open',me)},700)})}
 else{setTimeout(()=>em('open',me));
  self.connect=hid=>{const c=open(hid),k=conn(m=>c.send({type:'broadcast',event:'m',payload:{to:'host',from:me,msg:m}}));
   c.on('broadcast',{event:'m'},({payload:p})=>{if(p.to===me||p.to==='*')k.emit('data',p.msg)});
   c.on('presence',{event:'leave'},({leftPresences:l})=>{if((l||[]).some(x=>x.host))k.emit('close')});
   c.subscribe(async s=>{if(s!=='SUBSCRIBED')return;await c.track({});let n=0;const t=setInterval(()=>{const st=c.presenceState();if(Object.keys(st).some(x=>st[x].some(y=>y.host))){clearInterval(t);k.emit('open')}else if(++n>25){clearInterval(t);em('error',{type:'peer-unavailable'})}},300)});return k}}};
})();
