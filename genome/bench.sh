#!/usr/bin/env bash
# bench.sh — mesure le DÉBIT RÉEL de la machine (aucune estimation, que du compté).
# Compte les battements écrits dans les journaux sur une fenêtre de temps et
# affiche battements/minute par membre et au total.
#
# Usage : bash bench.sh [runtime] [secondes]
#   bash bench.sh                  # runtime-perf, 60 s
#   bash bench.sh runtime-perf 120 # 2 minutes

set -u
RT="${1:-runtime-perf}"
WIN="${2:-60}"
cd "$(dirname "$0")" || exit 1
[ -d "$RT" ] || { echo "runtime introuvable: $RT"; exit 1; }

count_beats() {
  local total=0
  for f in "$RT"/m*/run.log; do
    [ -f "$f" ] || continue
    n=$(grep -c "BEAT" "$f" 2>/dev/null || true)
    total=$((total + ${n:-0}))
  done
  echo "$total"
}

before=$(count_beats)
echo "[bench] fenêtre ${WIN}s — membres actifs: $(ls -d "$RT"/m*/ 2>/dev/null | wc -l)"
sleep "$WIN"
after=$(count_beats)

delta=$((after - before))
per_min=$(( delta * 60 / WIN ))
echo "[bench] battements pendant la fenêtre : $delta"
echo "[bench] DÉBIT RÉEL : ${per_min} battements/minute sur cette machine"
[ "$per_min" -gt 0 ] && echo "[bench] soit ~$(( per_min * 60 * 24 )) battements/jour si la machine reste allumée"
echo "[bench] membres vivants maintenant : $(for p in "$RT"/m*/pid; do [ -f "$p" ] && kill -0 "$(cat "$p")" 2>/dev/null && echo x; done | wc -l)"
