const V='qm-v5',SHELL=['./','index.html','test.html','admin.html','shared.js','config.js','manifest.webmanifest','data/manifest.json','icon.svg'];
const ft=(r,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej('timeout'),ms);fetch(r).then(x=>{clearTimeout(t);res(x)},e=>{clearTimeout(t);rej(e)})});
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||/supabase\.co/.test(u.host)||!/^https?:$/.test(u.protocol))return;
 if(u.origin===location.origin&&(u.pathname==='/'||/\.(html|js)$/.test(u.pathname)||!/\.[a-z0-9]+$/i.test(u.pathname))){e.respondWith(ft(r,3500).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));return}
 e.respondWith(caches.open(V).then(async c=>{const hit=await c.match(r,{ignoreSearch:true}),net=fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res});
  if(hit){net.catch(()=>0);return hit}return net.catch(()=>c.match('index.html'))}))});
