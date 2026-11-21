/* ALPHATECH — couche commune des applications (PWA, assistant local, sécurité, exports)
   Aucune dépendance, aucun appel réseau : tout fonctionne hors ligne.
   Chargé par gestion/, pharmacie/ et hopital/ avec data-app et data-store. */
(function () {
  "use strict";
  var me = document.currentScript;
  var APP = (me && me.dataset.app) || "app";
  var STORE = (me && me.dataset.store) || "";
  var NOM = { gestion: "Gestion", pharmacie: "Pharmacie", hopital: "Hôpital" }[APP] || "Application";

  function lire() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; }
  }
  function fcfa(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") + " FCFA";
  }
  function jour(d) { return new Date(d).toISOString().slice(0, 10); }
  function aujourdhui() { return jour(Date.now()); }

  /* ---------- 1. Installation et hors ligne ---------- */
  function pwa() {
    var l = document.createElement("link");
    l.rel = "manifest"; l.href = "manifest.webmanifest";
    document.head.appendChild(l);
    var t = document.createElement("meta");
    t.name = "theme-color"; t.content = "#0d0714";
    document.head.appendChild(t);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    }
  }

  /* ---------- 2. Assistant local (règles, sur les données réelles) ---------- */
  function repondre(q) {
    var s = lire(), t = (q || "").toLowerCase(), out = [];
    var a = aujourdhui();

    if (APP === "gestion") {
      var docs = s.docs || [], cl = s.clients || [], pr = s.produits || [], mv = s.mouvements || [];
      var tot = function (d) {
        var ht = (d.lignes || []).reduce(function (x, l) { return x + (Number(l.qte) || 0) * (Number(l.prix) || 0); }, 0);
        return ht * (d.tva ? 1 + (Number(s.reglages && s.reglages.tva) || 0) : 1);
      };
      var paye = function (d) { return (d.paiements || []).reduce(function (x, p) { return x + (Number(p.montant) || 0); }, 0); };
      if (/doit|impay|créance|creance|reste/.test(t)) {
        var imp = docs.filter(function (d) { return d.type === "facture" && tot(d) - paye(d) > 1; });
        out.push(imp.length + " facture(s) non soldée(s) pour " + fcfa(imp.reduce(function (x, d) { return x + tot(d) - paye(d); }, 0)) + ".");
        imp.slice(0, 5).forEach(function (d) { out.push("· " + (d.numero || "") + " " + (d.clientNom || "") + " — reste " + fcfa(tot(d) - paye(d))); });
      } else if (/stock|faible|rupture|recommander/.test(t)) {
        var bas = pr.filter(function (p) { return (Number(p.qte) || 0) <= (Number(p.seuil) || 0); });
        out.push(bas.length + " produit(s) au seuil ou en dessous.");
        bas.slice(0, 6).forEach(function (p) { out.push("· " + p.nom + " : " + (p.qte || 0) + " en stock"); });
      } else if (/chiffre|vente|encaiss|recette/.test(t)) {
        var enc = mv.filter(function (m) { return m.type === "entree"; }).reduce(function (x, m) { return x + (Number(m.montant) || 0); }, 0);
        var dep = mv.filter(function (m) { return m.type === "sortie"; }).reduce(function (x, m) { return x + (Number(m.montant) || 0); }, 0);
        out.push("Encaissé " + fcfa(enc) + ", dépensé " + fcfa(dep) + ", solde " + fcfa(enc - dep) + ".");
      } else if (/client/.test(t)) {
        out.push(cl.length + " client(s) enregistré(s).");
        cl.slice(0, 5).forEach(function (c) { out.push("· " + c.nom + (c.tel ? " — " + c.tel : "")); });
      } else {
        out.push("Je réponds sur : qui me doit de l'argent, stock faible, chiffre et dépenses, liste des clients.");
      }
    }

    if (APP === "pharmacie") {
      var ps = s.produits || [], vs = s.ventes || [];
      var qte = function (p) { return (p.lots || []).reduce(function (x, l) { return x + (Number(l.qte) || 0); }, 0); };
      if (/périme|perime|expire|péremption|peremption/.test(t)) {
        var lim = Date.now() + 60 * 864e5, al = [];
        ps.forEach(function (p) {
          (p.lots || []).forEach(function (l) {
            if (!l.per) return;
            var j = Math.round((new Date(l.per + "T00:00:00") - Date.now()) / 864e5);
            if (j <= 60) al.push("· " + p.nom + " lot " + l.lot + " : " + (j < 0 ? "périmé depuis " + (-j) + " j" : "expire dans " + j + " j"));
          });
        });
        out.push(al.length ? al.length + " lot(s) à surveiller :" : "Aucun lot ne périme dans les 60 jours.");
        out = out.concat(al.slice(0, 8));
      } else if (/rupture|stock|manque|seuil/.test(t)) {
        var r = ps.filter(function (p) { return qte(p) <= (Number(p.seuil) || 0); });
        out.push(r.length + " produit(s) en rupture ou au seuil.");
        r.slice(0, 8).forEach(function (p) { out.push("· " + p.nom + " : " + qte(p)); });
      } else if (/top|meilleur|plus vendu/.test(t)) {
        var c = {};
        vs.forEach(function (v) { (v.lignes || []).forEach(function (l) { c[l.nom] = (c[l.nom] || 0) + (Number(l.qte) || 0); }); });
        var top = Object.keys(c).sort(function (x, y) { return c[y] - c[x]; }).slice(0, 5);
        out.push(top.length ? "Meilleures ventes :" : "Aucune vente enregistrée pour l'instant.");
        top.forEach(function (n) { out.push("· " + n + " : " + c[n]); });
      } else if (/chiffre|vente|recette|caisse|marge/.test(t)) {
        var du = vs.filter(function (v) { return jour(v.date) === a; });
        var ca = du.reduce(function (x, v) { return x + (Number(v.total) || 0); }, 0);
        var mg = du.reduce(function (x, v) { return x + (Number(v.marge) || 0); }, 0);
        out.push("Aujourd'hui : " + du.length + " vente(s), " + fcfa(ca) + " encaissés, marge " + fcfa(mg) + ".");
      } else {
        out.push("Je réponds sur : ce qui périme, les ruptures, le chiffre du jour et la marge, les meilleures ventes.");
      }
    }

    if (APP === "hopital") {
      var pat = s.patients || [], adm = s.admissions || [], con = s.consultations || [], fac = s.factures || [], lits = s.lits || [];
      if (/hospitalis|présent|present|admis/.test(t)) {
        var en = adm.filter(function (x) { return !x.sortie; });
        out.push(en.length + " patient(s) hospitalisé(s) sur " + lits.length + " lit(s).");
        en.slice(0, 6).forEach(function (x) { out.push("· " + (x.patientNom || "") + " — " + (x.service || "") + " lit " + (x.lit || "")); });
      } else if (/lit|libre|occupation/.test(t)) {
        var occ = adm.filter(function (x) { return !x.sortie && x.litId; }).length;
        out.push(occ + " lit(s) occupé(s), " + Math.max(0, lits.length - occ) + " libre(s) sur " + lits.length + ".");
      } else if (/impay|doit|reste|facture/.test(t)) {
        var reste = fac.reduce(function (x, f) {
          var pay = (f.paiements || []).reduce(function (y, p) { return y + (Number(p.montant) || 0); }, 0);
          return x + Math.max(0, (Number(f.total) || 0) - pay);
        }, 0);
        out.push("Impayés : " + fcfa(reste) + " sur " + fac.length + " facture(s).");
      } else if (/consultation|jour|activité|activite/.test(t)) {
        var dj = con.filter(function (c) { return jour(c.date) === a; });
        out.push("Aujourd'hui : " + dj.length + " consultation(s), " + pat.length + " patient(s) au fichier.");
      } else {
        out.push("Je réponds sur : patients hospitalisés, lits libres, impayés, consultations du jour.");
      }
    }

    return out.join("\n");
  }

  /* ---------- 3. Sécurité : code d'accès et export chiffré ---------- */
  function sha(txt) {
    var b = new TextEncoder().encode(txt);
    return crypto.subtle.digest("SHA-256", b).then(function (h) {
      return Array.from(new Uint8Array(h)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  var CLE_PIN = "at_pin_" + APP;

  function porte() {
    var h = localStorage.getItem(CLE_PIN);
    if (!h) return;
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0d0714;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;font-family:system-ui,sans-serif;color:#fff";
    d.innerHTML = '<div style="font-size:13px;letter-spacing:.14em;color:#c77dff">' + NOM.toUpperCase() + ' · VERROUILLÉ</div>' +
      '<input id="atPinIn" type="password" inputmode="numeric" placeholder="Code" style="padding:14px;border-radius:12px;border:1px solid #444;background:#151021;color:#fff;font-size:20px;text-align:center;width:170px">' +
      '<button id="atPinOk" style="padding:12px 22px;border-radius:12px;border:0;background:#ffb347;color:#1a1205;font-weight:700">Ouvrir</button>' +
      '<div id="atPinErr" style="font-size:12px;color:#ff7b7b;height:14px"></div>';
    document.body.appendChild(d);
    var essai = function () {
      var v = (document.getElementById("atPinIn") || {}).value || "";
      sha(v).then(function (x) {
        if (x === h) { d.remove(); }
        else { document.getElementById("atPinErr").textContent = "Code incorrect"; }
      });
    };
    document.getElementById("atPinOk").onclick = essai;
    document.getElementById("atPinIn").onkeydown = function (e) { if (e.key === "Enter") essai(); };
  }

  function exporterChiffre(mot) {
    var data = JSON.stringify(lire());
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(mot), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("alphatech-" + APP), iterations: 120000, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    }).then(function (k) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, enc.encode(data)).then(function (ct) {
        var tout = new Uint8Array(12 + ct.byteLength);
        tout.set(iv, 0); tout.set(new Uint8Array(ct), 12);
        var b64 = btoa(String.fromCharCode.apply(null, tout));
        var a = document.createElement("a");
        a.href = "data:application/octet-stream;base64," + b64;
        a.download = APP + "-sauvegarde-" + aujourdhui() + ".aes";
        a.click();
        return b64.length;
      });
    });
  }

  function exporterCSV() {
    var s = lire(), lignes = [];
    var coll = APP === "gestion" ? [["clients", s.clients], ["produits", s.produits], ["documents", s.docs], ["mouvements", s.mouvements]]
      : APP === "pharmacie" ? [["produits", s.produits], ["ventes", s.ventes], ["retours", s.retours]]
        : [["patients", s.patients], ["admissions", s.admissions], ["consultations", s.consultations], ["factures", s.factures]];
    coll.forEach(function (paire) {
      var nom = paire[0], arr = paire[1] || [];
      if (!arr.length) return;
      lignes.push("### " + nom);
      var cols = {};
      arr.forEach(function (o) { Object.keys(o).forEach(function (k) { if (k !== "lignes" && k !== "lots" && k !== "paiements") cols[k] = 1; }); });
      var t = Object.keys(cols);
      lignes.push(t.join(";"));
      arr.forEach(function (o) {
        lignes.push(t.map(function (k) { var v = o[k]; return typeof v === "string" ? '"' + v.replace(/"/g, '""') + '"' : (v == null ? "" : v); }).join(";"));
      });
      lignes.push("");
    });
    var blob = new Blob(["\ufeff" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = APP + "-" + aujourdhui() + ".csv";
    a.click();
  }

  /* ---------- 4. Panneau ---------- */
  function panneau() {
    var b = document.createElement("button");
    b.textContent = "＋";
    b.title = "Assistant, sécurité, exports";
    b.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9990;width:52px;height:52px;border-radius:50%;border:1px solid rgba(199,125,255,.5);background:#1a1026;color:#ffb347;font-size:26px;line-height:1;box-shadow:0 6px 18px rgba(0,0,0,.45)";
    document.body.appendChild(b);

    var p = document.createElement("div");
    p.style.cssText = "position:fixed;right:14px;bottom:78px;z-index:9991;width:min(92vw,360px);max-height:72vh;overflow:auto;background:#120c1d;border:1px solid rgba(199,125,255,.35);border-radius:16px;padding:14px;color:#e8e0f5;font:13px/1.5 system-ui,sans-serif;display:none";
    p.innerHTML =
      '<div style="font-size:11px;letter-spacing:.16em;color:#c77dff;margin-bottom:8px">' + NOM.toUpperCase() + ' · OUTILS</div>' +
      '<input id="atQ" placeholder="Pose ta question…" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff">' +
      '<div style="display:flex;gap:6px;margin:8px 0">' +
      '<button id="atAsk" style="flex:1;padding:9px;border-radius:10px;border:0;background:#ffb347;color:#1a1205;font-weight:700">Demander</button>' +
      '<button id="atMic" title="Question à la voix" style="padding:9px 12px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff">🎤</button></div>' +
      '<div id="atRep" style="white-space:pre-wrap;font-size:12.5px;color:#cfc6e0;min-height:18px;margin-bottom:10px"></div>' +
      '<hr style="border:0;border-top:1px solid #2a1f3d;margin:10px 0">' +
      '<div style="display:grid;gap:6px">' +
      '<button id="atCsv" style="padding:9px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff;text-align:left">⬇️ Exporter en tableur (CSV)</button>' +
      '<button id="atEnc" style="padding:9px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff;text-align:left">🔐 Sauvegarde chiffrée (AES-256)</button>' +
      '<button id="atPin" style="padding:9px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff;text-align:left">🔑 Code d\'accès</button>' +
      '<button id="atInst" style="padding:9px;border-radius:10px;border:1px solid #3a2c4f;background:#0d0714;color:#fff;text-align:left">📲 Installer sur le téléphone</button>' +
      '</div><div id="atMsg" style="font-size:11.5px;color:#9d8fb8;margin-top:8px"></div>';

    document.body.appendChild(p);
    b.onclick = function () { p.style.display = p.style.display === "none" ? "block" : "none"; };

    var msg = function (t) { document.getElementById("atMsg").textContent = t; };

    document.getElementById("atAsk").onclick = function () {
      var q = document.getElementById("atQ").value;
      document.getElementById("atRep").textContent = repondre(q);
    };
    document.getElementById("atQ").onkeydown = function (e) {
      if (e.key === "Enter") document.getElementById("atAsk").click();
    };
    document.getElementById("atMic").onclick = function () {
      var R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) return msg("Reconnaissance vocale indisponible sur ce navigateur.");
      var r = new R(); r.lang = "fr-FR"; r.interimResults = false;
      r.onresult = function (e) {
        document.getElementById("atQ").value = e.results[0][0].transcript;
        document.getElementById("atAsk").click();
      };
      r.onerror = function () { msg("Micro refusé ou indisponible."); };
      try { r.start(); msg("Je t'écoute…"); } catch (e) { msg("Micro déjà en cours."); }
    };
    document.getElementById("atCsv").onclick = function () { exporterCSV(); msg("Fichier CSV généré."); };
    document.getElementById("atEnc").onclick = function () {
      var m = prompt("Mot de passe de la sauvegarde (il ne sera pas conservé) :");
      if (!m || m.length < 6) return msg("Mot de passe trop court, six caractères minimum.");
      exporterChiffre(m).then(function () { msg("Sauvegarde chiffrée téléchargée. Sans ce mot de passe, elle est illisible."); })
        .catch(function () { msg("Chiffrement impossible sur ce navigateur."); });
    };
    document.getElementById("atPin").onclick = function () {
      var actuel = localStorage.getItem(CLE_PIN);
      if (actuel) {
        if (confirm("Retirer le code d'accès ?")) { localStorage.removeItem(CLE_PIN); msg("Code retiré."); }
        return;
      }
      var c = prompt("Choisis un code (4 chiffres minimum) :");
      if (!c || c.length < 4) return msg("Code trop court.");
      sha(c).then(function (h) { localStorage.setItem(CLE_PIN, h); msg("Code activé. Il sera demandé à chaque ouverture."); });
    };
    document.getElementById("atInst").onclick = function () {
      if (window.__atInstall) { window.__atInstall.prompt(); return; }
      msg("Ouvre le menu du navigateur puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».");
    };
  }

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.__atInstall = e; });

  function demarrer() {
    pwa();
    porte();
    panneau();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
