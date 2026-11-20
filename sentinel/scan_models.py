#!/usr/bin/env python3
"""MODÈLES — inventaire vivant de tous les modèles publics du monde.

Lit deux catalogues publics (OpenRouter et Hugging Face), calcule ce qui a
changé depuis le dernier passage, et écrit un registre daté. Lecture seule.
"""
import json, os, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "models.json")
UA = {"User-Agent": "ALPHATECH-MODELS/1.0 (inventaire public)"}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def openrouter():
    try:
        d = get("https://openrouter.ai/api/v1/models")
    except Exception:
        return []
    out = []
    for m in d.get("data", []):
        pr = m.get("pricing") or {}
        try:
            pin = float(pr.get("prompt", 0)) * 1_000_000
            pout = float(pr.get("completion", 0)) * 1_000_000
        except Exception:
            pin = pout = None
        out.append({
            "id": m.get("id"),
            "nom": m.get("name") or m.get("id"),
            "fournisseur": (m.get("id") or "").split("/")[0],
            "contexte": m.get("context_length") or 0,
            "prix_entree_par_million": round(pin, 3) if pin is not None else None,
            "prix_sortie_par_million": round(pout, 3) if pout is not None else None,
            "modalites": (m.get("architecture") or {}).get("modality"),
            "source": "OpenRouter",
        })
    return out


def huggingface():
    try:
        d = get("https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=100")
    except Exception:
        return []
    out = []
    for m in d:
        out.append({
            "id": m.get("modelId"),
            "nom": m.get("modelId"),
            "fournisseur": (m.get("modelId") or "").split("/")[0],
            "contexte": 0,
            "derniere_modif": m.get("lastModified"),
            "telechargements": m.get("downloads", 0),
            "jaime": m.get("likes", 0),
            "tache": m.get("pipeline_tag"),
            "source": "Hugging Face",
        })
    return out


def main():
    reg = {"maj": None, "openrouter": [], "huggingface": [], "nouveautes": [], "historique": []}
    if os.path.exists(OUT):
        try:
            reg = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass

    anciens = {m["id"] for m in reg.get("openrouter", [])} | {m["id"] for m in reg.get("huggingface", [])}
    ors = openrouter()
    hfs = huggingface()
    maintenant = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    nouveaux = []
    for m in ors + hfs:
        if m["id"] and m["id"] not in anciens:
            nouveaux.append({"id": m["id"], "source": m["source"], "vu": maintenant})

    # historique des nouveautés, dédoublonné, plafonné
    vus = {n["id"] for n in reg.get("nouveautes", [])}
    hist = reg.get("nouveautes", []) + [n for n in nouveaux if n["id"] not in vus]
    reg["nouveautes"] = hist[-400:]

    reg["openrouter"] = ors
    reg["huggingface"] = hfs
    reg["maj"] = maintenant
    reg["historique"] = (reg.get("historique", []) + [{
        "ts": maintenant, "openrouter": len(ors), "huggingface": len(hfs), "nouveaux": len(nouveaux)
    }])[-200:]

    json.dump(reg, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"openrouter={len(ors)} huggingface={len(hfs)} nouveaux={len(nouveaux)} maj={maintenant}")


if __name__ == "__main__":
    main()
