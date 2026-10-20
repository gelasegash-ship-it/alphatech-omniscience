#!/bin/bash
# V5.2 — Relance toute la famille + gardien. Tuer par /proc/comm, tmux uniquement (nohup gele).
cd /app/conversations/6a8ed06312b12b3300218e7d/automaton-runtime
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  [ "$(cat /proc/$pid/comm 2>/dev/null)" = "node" ] || continue
  case "$(readlink /proc/$pid/cwd 2>/dev/null)" in *automaton-runtime*) kill -9 $pid 2>/dev/null;; esac
done
for s in $(tmux list-sessions -F '#S' 2>/dev/null); do tmux kill-session -t "$s" 2>/dev/null; done
sleep 2
for d in $(find . -maxdepth 5 -type d -name 'gen*'); do cp agent.mjs "$d/agent.mjs"; done
i=0
for st in $(find . -maxdepth 6 -name state.json | sort); do
  d=$(dirname "$st")
  tmux new-session -d -s "at-m$i" "cd '$PWD/$d' && node agent.mjs >> run.log 2>&1"
  i=$((i+1))
done
tmux new-session -d -s gardien "cd '$PWD' && node guardian.mjs >> guardian.log 2>&1"
echo "famille relancee ($i membres) + gardien en poste"
