/* ALPHATECH OMNISCIENCE - Service Worker V1028 - fonctionne toujours, meme hors ligne */
var CACHE='alphatech-v1028';
var CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(CORE);}));self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET'){return;}
  var u=e.request.url;
  if(u.indexOf('base44.app')>0||u.indexOf('pollinations')>0||u.indexOf('api.')>0||u.indexOf('rpc.')>0){return;}
  e.respondWith(caches.match(e.request).then(function(r){
    var fetching=fetch(e.request).then(function(res){
      if(res&&res.ok){var cl=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,cl);});}
      return res;
    }).catch(function(){return r;});
    return r||fetching;
  }));
});
