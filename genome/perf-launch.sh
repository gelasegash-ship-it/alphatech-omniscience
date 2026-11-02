#!/usr/bin/env bash
# perf-launch.sh — Démarrage optimisé des 16 membres ALPHATECH sur une machine.
# Objectif : maximiser le débit réel (battements/minute) sans jamais toucher agent.mjs.
#
# Ce qui est optimisé (à l'extérieur du génome, immuable) :
#   1. Démarrage ÉTAGÉ : évite les rafales 429 de Groq (cause n°1 de perte de débit).
#   2. Priorité CPU basse (nice) : la machine reste utilisable.
#   3. Journaux bornés : rotation automatique, zéro saturation disque.
#   4. Supervision : relance immédiate de tout membre mort.
#   5. Rotation de clés Groq si plusieurs sont fournies (GROQ_API_KEY_1..N).
#
# Usage :
#   bash perf-launch.sh            # 16 membres (défaut)
#   MEMBERS=8 bash perf-launch.sh  # autant que la RAM le permet
#   STAGGER=4 bash perf-launch.sh  # 4 s entre deux naissances (défaut 6)

set -u
MEMBERS="${MEMBERS:-16}"
STAGGER="${STAGGER:-6}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="${RUNTIME:-$HERE/runtime-perf}"
LOGMAX=$((2*1024*1024))   # 2 Mo par journal

mkdir -p "$RUNTIME"

# --- clés Groq : une par membre si plusieurs sont fournies -------------------
key_for() {
  local i="$1"
  local var="GROQ_API_KEY_$i"
  if [ -n "${!var:-}" ]; then echo "${!var}"; return; fi
  local var0="GROQ_API_KEY_0"
  if [ -n "${!var0:-}" ]; then echo "${!var0}"; return; fi
  echo "${GROQ_API_KEY:-}"
}

if [ -z "${GROQ_API_KEY:-}${GROQ_API_KEY_0:-}" ]; then
  echo "[!] Aucune clé Groq trouvée. Exporte GROQ_API_KEY (gratuite sur console.groq.com)."
  exit 1
fi

echo "[perf] Démarrage de $MEMBERS membres, étalement ${STAGGER}s, runtime $RUNTIME"

start_member() {
  local i="$1"
  local dir="$RUNTIME/m$i"
  mkdir -p "$dir"
  [ -f "$dir/state.json" ] || cp "$HERE/state.json" "$dir/state.json" 2>/dev/null || true
  [ -f "$dir/missions.json" ] || cp "$HERE/missions.json" "$dir/missions.json" 2>/dev/null || true
  local k; k="$(key_for "$i")"
  ( cd "$dir" && GROQ_API_KEY="$k" nice -n 5 node "$HERE/agent.mjs" >> "$dir/run.log" 2>&1 & echo $! > "$dir/pid" )
  echo "[perf] membre $i né (pid $(cat "$dir/pid" 2>/dev/null))"
}

# --- 1. naissances étagées ---------------------------------------------------
for i in $(seq 1 "$MEMBERS"); do
  start_member "$i"
  sleep "$STAGGER"
done

# --- 2. rotation des journaux (boucle légère) -------------------------------
(
  while true; do
    sleep 120
    find "$RUNTIME" -name run.log -size +2M -exec sh -c ': > "$1"' _ {} \; 2>/dev/null
  done
) >/dev/null 2>&1 &

# --- 3. supervision : relance tout membre mort ------------------------------
(
  while true; do
    sleep 30
    for d in "$RUNTIME"/m*/; do
      [ -d "$d" ] || continue
      pid="$(cat "$d/pid" 2>/dev/null || echo 0)"
      if ! kill -0 "$pid" 2>/dev/null; then
        echo "[perf] $(date -u +%H:%M:%S) relance $(basename "$d")"
        i="${d%/}"; i="${i##*m}"
        start_member "$i"
      fi
    done
  done
) >/dev/null 2>&1 &
