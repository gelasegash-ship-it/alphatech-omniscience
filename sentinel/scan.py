#!/usr/bin/env python3
"""SENTINEL — veille autonome d'ALPHATECH.

Lit des sources publiques, retient ce qui concerne réellement les agents
autonomes et les capacités logicielles, et écrit un registre daté.
Aucune exécution de code trouvé, aucune intrusion : lecture seule.
"""
import json, os, re, sys, hashlib, urllib.request, urllib.error
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(ROOT, "registry.json")

MOTS = [
    "agent", "agents", "autonomous", "self-improv", "tool use", "tool-use",
    "memory", "context", "evaluation", "benchmark", "reasoning", "planner",
    "retrieval", "rag", "orchestration", "workflow", "fine-tun", "distill",
    "security", "prompt injection", "guardrail", "sandbox", "observability",
    "quantization", "inference", "multimodal", "speech", "vision",
]
# ce qu'ALPHATECH peut réellement intégrer sans modèle externe ni serveur
ADOPTABLE = [
    "benchmark", "evaluation", "observability", "guardrail", "prompt injection",
    "retrieval", "rag", "planner", "workflow", "orchestration", "memory",
    "quantization", "inference", "sandbox",
]

UA = {"User-Agent": "ALPHATECH-SENTINEL/1.0 (veille technique; contact gelasegash@gmail.com)"}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def from_hn():
    out = []
    try:
        xml = get("https://hnrss.org/frontpage")
    except Exception:
        return out
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        bloc = m.group(1)
        t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", bloc, re.S)
        l = re.search(r"<link>(.*?)</link>", bloc, re.S)
        if not (t and l):
            continue
        out.append({"titre": t.group(1).strip(), "url": l.group(1).strip(),
                    "source": "Hacker News", "resume": ""})
    return out


def from_arxiv():
    out = []
    try:
        xml = get("https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG"
                  "&sortBy=submittedDate&sortOrder=descending&max_results=25")
    except Exception:
        return out
    for m in re.finditer(r"<entry>(.*?)</entry>", xml, re.S):
        b = m.group(1)
        t = re.search(r"<title>(.*?)</title>", b, re.S)
        i = re.search(r"<id>(.*?)</id>", b, re.S)
        s = re.search(r"<summary>(.*?)</summary>", b, re.S)
        if not (t and i):
            continue
        out.append({"titre": re.sub(r"\s+", " ", t.group(1)).strip(),
                    "url": i.group(1).strip(), "source": "arXiv",
                    "resume": re.sub(r"\s+", " ", s.group(1)).strip()[:300] if s else ""})
    return out


def from_github():
    out = []
    try:
        d = json.loads(get("https://api.github.com/search/repositories"
                           "?q=autonomous+agent+OR+llm+agent&sort=updated&order=desc&per_page=15"))
    except Exception:
        return out
    for r in d.get("items", []):
        out.append({"titre": r["full_name"], "url": r["html_url"],
                    "source": "GitHub", "resume": (r.get("description") or "")[:300]})
    return out


def score(txt):
    t = txt.lower()
    hits = [m for m in MOTS if m in t]
    adopt = [m for m in ADOPTABLE if m in t]
    return len(hits), hits[:6], bool(adopt), adopt[:4]


def empreinte(u):
    return hashlib.sha256(u.encode()).hexdigest()[:16]


def main():
    reg = {"maj": None, "scans": [], "capacites": [], "refus": [
        "Aucun code trouvé n'est exécuté ni installé automatiquement.",
        "Aucune création de logiciel nuisible (ver, virus, charge utile) : refus constant.",
        "Aucune modification de code appliquée sans validation humaine explicite."
    ]}
    if os.path.exists(REG):
        try:
            reg = json.load(open(REG, encoding="utf-8"))
        except Exception:
            pass

    connues = {c["empreinte"] for c in reg.get("capacites", [])}
    items = from_hn() + from_arxiv() + from_github()
    ajout, examines = 0, len(items)

    for it in items:
        n, hits, adoptable, adopt_mots = score(it["titre"] + " " + it.get("resume", ""))
        if n < 2:
            continue
        e = empreinte(it["url"])
        if e in connues:
            continue
        connues.add(e)
        reg["capacites"].append({
            "empreinte": e,
            "titre": it["titre"][:180],
            "url": it["url"],
            "source": it["source"],
            "resume": it.get("resume", "")[:240],
            "score": n,
            "mots": hits,
            "adoptable_localement": adoptable,
            "mots_adoptables": adopt_mots,
            "vu": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "statut": "candidat"
        })
        ajout += 1

    reg["capacites"].sort(key=lambda c: (-c["score"], c["vu"]))
    reg["capacites"] = reg["capacites"][:200]
    reg["maj"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reg.setdefault("scans", []).append({
        "ts": reg["maj"], "examines": examines, "retenus": ajout,
        "total_registre": len(reg["capacites"]),
        "sources": sorted({i["source"] for i in items})
    })
    reg["scans"] = reg["scans"][-120:]

    json.dump(reg, open(REG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"examines={examines} retenus={ajout} registre={len(reg['capacites'])} maj={reg['maj']}")


if __name__ == "__main__":
    main()
