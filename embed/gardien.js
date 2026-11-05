/* ALPHATECH GARDIEN — badge intégrable. Usage : <script src=".../embed/gardien.js" data-pos="br"></script> */
(function(){
  var s = document.currentScript || document.querySelector('script[src*="gardien.js"]');
  var pos = (s && s.getAttribute('data-pos')) || 'br';
  var base = 'https://gelasegash-ship-it.github.io/alphatech-omniscience';
  var css = {
    br:'bottom:16px;right:16px', bl:'bottom:16px;left:16px',
    tr:'top:16px;right:16px', tl:'top:16px;left:16px'
  }[pos] || 'bottom:16px;right:16px';
  var a = document.createElement('a');
  a.href = base + '/gardien/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label','ALPHATECH GARDIEN — surveillance mondiale');
  a.style.cssText = 'position:fixed;z-index:2147483000;'+css+';display:flex;align-items:center;gap:8px;'
    + 'background:#101218;color:#e8c878;border:1px solid #4a4530;border-radius:999px;'
    + 'padding:8px 14px;font:600 12px/1 "Segoe UI",system-ui,sans-serif;text-decoration:none;'
    + 'box-shadow:0 6px 22px rgba(0,0,0,.45)';
  a.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#7fd1a0;display:inline-block"></span>'
    + '<span>Veille ALPHATECH</span>';
  function monter(){ if(!document.body.contains(a)) document.body.appendChild(a); }
  if(document.body) monter(); else document.addEventListener('DOMContentLoaded', monter);
  fetch(base + '/gardien/feed.json').then(function(r){return r.json()}).then(function(d){
    var c = d.couverture || {};
    if(c.btc_sous_surveillance) a.querySelector('span:last-child').textContent = Math.round(c.btc_sous_surveillance) + ' BTC surveillés';
    a.title = (c.groupes_suivis||'') + ' groupes suivis · ' + (c.portefeuilles_surveilles||'') + ' portefeuilles';
  }).catch(function(){});
})();
