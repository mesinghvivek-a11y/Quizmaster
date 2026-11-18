/* Quiz Master shared layer: Supabase auth + cross-device sync + realtime rooms. Works without config (guest/offline mode). */
(function(){
const C=window.QM_CONFIG||{},enabled=!!(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY&&!/YOUR_/.test(C.SUPABASE_URL+C.SUPABASE_ANON_KEY));
const SBJS='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let sb=null,dbp=null,timer=null;const last=new Map(),cbs=[],emit=e=>cbs.forEach(f=>{try{f(e)}catch(x){}});
const QM=window.QM={enabled,user:null,isAdmin:false,listen:f=>cbs.push(f),client:()=>sb};
const idb=()=>dbp||(dbp=new Promise(r=>{try{const q=indexedDB.open('quizmaster',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>r(q.result);q.onerror=()=>r(null)}catch(e){r(null)}}));
const tx=async(m,fn)=>{const d=await idb();if(!d)return null;return new Promise(r=>{const t=d.transaction('kv',m),q=fn(t.objectStore('kv'));t.oncomplete=()=>r(q&&q.result);t.onerror=t.onabort=()=>r(null)})};
QM.kvGet=async k=>{const v=await tx('readonly',s=>s.get(k));return v===undefined?null:v};
QM.kvSet=async(k,v)=>{await tx('readwrite',s=>s.put(v,k));dirty()};
QM.kvDel=k=>tx('readwrite',s=>s.delete(k));
QM.kvKeys=async p=>((await tx('readonly',s=>s.getAllKeys()))||[]).filter(k=>k.startsWith(p));
async function all(){const o={};for(const k of await QM.kvKeys(''))o[k]=await QM.kvGet(k);try{Object.keys(localStorage).filter(k=>/^(pq-state|qm-state)/.test(k)).forEach(k=>o['ls:'+k]=localStorage.getItem(k))}catch(e){}return o}
QM.all=all;
async function put(k,v){if(k.startsWith('ls:')){try{localStorage.setItem(k.slice(3),v)}catch(e){}}else await tx('readwrite',s=>s.put(v,k))}
QM.put=put;
const merge=(k,l,r)=>{if(l==null)return r;if(r==null)return l;
 if(k==='sessions'){const m=new Map(l.map(x=>[x.id,x]));r.forEach(x=>{const o=m.get(x.id);if(!o||(x.en||0)>(o.en||0))m.set(x.id,x)});return[...m.values()]}
 if(k.startsWith('qs:')){const o={...l};for(const i in r)if(!o[i]||(r[i].t||0)>(o[i].t||0))o[i]=r[i];return o}
 if(k==='daily'){const o={...l};for(const d in r)o[d]=Math.max(o[d]||0,r[d]);return o}
 if(k.startsWith('ls:')){const n=s=>{try{return JSON.parse(s).a.length}catch(e){return 0}};return n(r)>n(l)?r:l}
 if(k.startsWith('notes:')||k==='prefs')return{...r,...l};
 return l};
async function pull(){const{data,error}=await sb.from('user_data').select('k,v');if(error)return false;const loc=await all();let ch=0;
 for(const r of data){const m=merge(r.k,loc[r.k],r.v);if(JSON.stringify(m)!==JSON.stringify(loc[r.k])){await put(r.k,m);ch++}}
 await push();return ch>0}
async function push(){if(!sb||!QM.user)return;const loc=await all(),rows=[];
 for(const k in loc){const s=JSON.stringify(loc[k]);if(last.get(k)!==s){last.set(k,s);rows.push({user_id:QM.user.id,k,v:loc[k],updated_at:new Date().toISOString()})}}
 for(let i=0;i<rows.length;i+=10){const{error}=await sb.from('user_data').upsert(rows.slice(i,i+10));if(error){rows.slice(i).forEach(r=>last.delete(r.k));emit('sync:error');return}}emit('sync:ok')}
function dirty(){if(!QM.user)return;clearTimeout(timer);timer=setTimeout(push,4000)}QM.dirty=dirty;QM.push=push;
function mk(){sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{realtime:{params:{eventsPerSecond:40}}})}
QM.load=()=>sb?Promise.resolve():new Promise((res,rej)=>{if(window.supabase){mk();return res()}const s=document.createElement('script');s.src=SBJS;s.onload=()=>{mk();res()};s.onerror=rej;document.head.append(s)});
async function flushRq(){let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}if(!q.length)return;const{error}=await sb.from('reports').insert(q);if(!error)localStorage.removeItem('qm-rq')}
async function after(){const{data}=await sb.from('profiles').select('is_admin').maybeSingle();QM.isAdmin=!!(data&&data.is_admin);const ch=await pull();flushRq();emit('auth');if(ch)emit('pulled')}
QM.init=async()=>{if(!enabled||QM.inited)return;QM.inited=1;try{await QM.load()}catch(e){return}
 const{data}=await sb.auth.getSession();QM.user=data.session?data.session.user:null;
 sb.auth.onAuthStateChange((ev,s)=>{const u=s?s.user:null,was=QM.user;QM.user=u;if(u&&(!was||was.id!==u.id))setTimeout(after,0);if(!u){QM.isAdmin=false;emit('auth')}});
 if(QM.user)await after()};
QM.signIn=async()=>{await QM.load();await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}})};
QM.signOut=async()=>{await sb.auth.signOut();QM.user=null;emit('auth')};
QM.report=async r=>{if(QM.user&&sb){const{error}=await sb.from('reports').insert(r);if(!error)return true}let q=[];try{q=JSON.parse(localStorage.getItem('qm-rq')||'[]')}catch(e){}q.push(r);localStorage.setItem('qm-rq',JSON.stringify(q));return false};
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
