const CACHE="medical-search-tools-v12",CORE=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./ema/","./pubmed/","./dienstplan/","./dienstplan/index.html","./dienstplan/styles.css","./dienstplan/viewer-tools.css","./dienstplan/config.js","./dienstplan/app.js","./updates/","./updates/styles.css","./updates/app.js","./updates/core.mjs"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  // Keep archive UI current on installed phones; API responses are never cached.
  if(url.pathname.startsWith(new URL('./updates/',self.location.href).pathname)){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)await cache.put(event.request,response.clone());return response;}catch{return await cache.match(event.request)||new Response('Bitte Internetverbindung prüfen.',{status:503});}})());return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match("./"))));
});
