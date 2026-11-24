#!/usr/bin/env python3
"""BOUCLE — le cycle cybernétique d'ALPHATECH : mesurer, comparer, corriger, consigner.
Aucune action offensive, aucune dépense : lecture de ses propres services et relance de son propre scan."""
import json, os, time, urllib.request, urllib.error, hashlib
from datetime import datetime, timezone

BASE = "https://gelasegash-ship-it.github.io/alphatech-omniscience"
CAPTEURS = [
    ("accueil", BASE + "/"),
    ("hub système", BASE + "/systeme/"),
    ("gestion", BASE + "/gestion/"),
    ("pharmacie", BASE + "/pharmacie/"),
    ("hôpital", BASE + "/hopital/"),
    ("routeur", BASE + "/routeur/"),
    ("modèles", BASE + "/modeles/"),
    ("banc", BASE + "/banc/"),
    ("arsenal", BASE + "/arsenal/"),
    ("couche commune", BASE + "/apps-plus.js"),
    ("registre veille", BASE + "/sentinel/registry.json"),
    ("registre modèles", BASE + "/sentinel/models.json"),
]
CIBLES = {"sante_min": 1.0, "fraicheur_max_heures": 3.0}
FICHIER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boucle.json")


def sonder(nom, url):
    debut = time.time()
    try:
        r = urllib.request.Request(url, headers={"User-Agent": "ALPHATECH-BOUCLE"})
        with urllib.request.urlopen(r, timeout=20) as rep:
            rep.read(1024)
            code = rep.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception:
        code = 0
    return {"nom": nom, "url": url, "code": code, "ms": int((time.time() - debut) * 1000), "ok": code == 200}


def fraicheur():
    try:
        d = json.load(open(os.path.join(os.path.dirname(FICHIER), "registry.json")))
        maj = datetime.fromisoformat(d["maj"].replace("Z", "+00:00"))
        heures = (datetime.now(timezone.utc) - maj).total_seconds() / 3600
        return round(heures, 2), len(d.get("capacites", []))
    except Exception:
        return None, 0


def relancer_scan():
    """Correction automatique : relance le workflow de veille s'il est en retard."""
    jeton = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    depot = os.environ.get("GITHUB_REPOSITORY")
    if not jeton or not depot:
        return False, "jeton absent (exécution hors GitHub Actions)"
    url = f"https://api.github.com/repos/{depot}/actions/workflows/sentinel.yml/dispatches"
    donnees = json.dumps({"ref": "main"}).encode()
    req = urllib.request.Request(url, data=donnees, method="POST", headers={
        "Authorization": "Bearer " + jeton, "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as rep:
            return rep.status in (204, 201), f"HTTP {rep.status}"
    except Exception as e:
        return False, str(e)[:80]


def main():
    capteurs = [sonder(n, u) for n, u in CAPTEURS]
    ok = sum(1 for c in capteurs if c["ok"])
    sante = round(ok / len(capteurs), 3)
    erreur = round(1 - sante, 3)
    heures, capacites = fraicheur()
    actions = []

    if heures is None or heures > CIBLES["fraicheur_max_heures"]:
        fait, detail = relancer_scan()
        actions.append({"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "type": "relance de la veille",
                        "detail": ("workflow relancé — " + detail) if fait else ("non relancé — " + detail),
                        "reussi": fait})
    for c in capteurs:
        if not c["ok"]:
            actions.append({"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                            "type": "capteur en défaut", "detail": f"{c['nom']} → HTTP {c['code']}",
                            "reussi": False})

    etat = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sante": sante, "erreur": erreur, "capteurs": capteurs,
            "veille": {"fraicheur_heures": heures, "capacites": capacites},
            "cibles": CIBLES, "actions": actions}

    historique = []
    if os.path.exists(FICHIER):
        try:
            ancien = json.load(open(FICHIER))
            historique = ancien.get("historique", [])[-79:]
        except Exception:
            historique = []
    historique.append({"ts": etat["ts"], "sante": sante, "erreur": erreur, "actions": len(actions)})
    etat["historique"] = historique
    etat["empreinte"] = hashlib.sha256(json.dumps(etat, sort_keys=True).encode()).hexdigest()[:16]

    with open(FICHIER, "w", encoding="utf-8") as f:
        json.dump(etat, f, ensure_ascii=False, indent=1)
    print(f"boucle: sante={sante} erreur={erreur} capteurs={ok}/{len(capteurs)} "
          f"veille={heures}h capacites={capacites} actions={len(actions)}")


if __name__ == "__main__":
    main()
