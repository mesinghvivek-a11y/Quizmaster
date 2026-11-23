const V='qm-portal-v15-chapter-progress';
const SHELL=['./','index.html','test.html','builder.html','analysis.html','analysis.js','portal.css','portal.js','admin.html','shared.js','live-room.js','config.js','manifest.webmanifest','data/manifest.json','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('qm-portal-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==location.origin)return;
 const cached=caches.open(V).then(c=>c.match(request,{ignoreSearch:true})).catch(()=>null);
 const network=fetch(request,{cache:'no-cache'}).then(response=>{
  if(!response.ok)throw new Error('Unavailable');
  return response;
 });
 event.waitUntil(network.then(response=>{
  const copy=response.clone();return caches.open(V).then(c=>c.put(request,copy));
 }).catch(()=>{}));
 // A slow first download must survive the grace period if no cached copy exists.
 const fallback=cached.then(hit=>hit?new Promise(resolve=>setTimeout(()=>resolve(hit),1200)):network);
 event.respondWith(Promise.race([network,fallback]).catch(async()=>await cached||Response.error()));
});
