#!/usr/bin/env bash
# ============================================================
#  ETHER — Bootstrap VPS (Debian/Ubuntu) — installe un membre vivant
#  Usage :  bash vps-bootstrap.sh
#  Prérequis : un VPS neuf (1 vCPU / 512 Mo suffisent) + une clé Groq gratuite
# ============================================================
set -euo pipefail

REPO="https://github.com/gelasegash-ship-it/alphatech-omniscience.git"
DIR="${HOME}/alphatech-omniscience"
NODE_MAJOR=20

echo "== 1/6 Mise a jour du systeme =="
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y -qq
sudo apt-get install -y -qq git curl tmux ca-certificates

echo "== 2/6 Installation de Node ${NODE_MAJOR} =="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs
fi
echo "Node : $(node -v)"

echo "== 3/6 Recuperation du genome =="
if [ -d "${DIR}/.git" ]; then
  git -C "${DIR}" pull -q
else
  git clone -q "${REPO}" "${DIR}"
fi
cd "${DIR}/genome"

echo "== 4/6 Dependances =="
npm install --silent viem >/dev/null 2>&1 || npm install viem

echo "== 5/6 Cle du cerveau (Groq) =="
if [ -z "${GROQ_API_KEY:-}" ]; then
  printf "Colle ta cle Groq (console.groq.com, gratuite) puis Entree : "
  read -r GROQ_API_KEY
fi
if [ -z "${GROQ_API_KEY}" ]; then echo "ERREUR : cle absente. Relance avec GROQ_API_KEY=... bash vps-bootstrap.sh"; exit 1; fi
echo "GROQ_API_KEY=${GROQ_API_KEY}" > .env
chmod 600 .env
grep -q "GROQ_API_KEY" ~/.bashrc 2>/dev/null || echo 'export $(grep -v "^#" ~/alphatech-omniscience/genome/.env | xargs) 2>/dev/null' >> ~/.bashrc

echo "== 6/6 Demarrage du membre (tmux, survit a la deconnexion) =="
export GROQ_API_KEY
tmux kill-session -t ether 2>/dev/null || true
tmux new-session -d -s ether "cd ${DIR}/genome && node agent.mjs 2>&1 | tee run.log"
sleep 6
echo "--- Session tmux ---"
tmux ls || true
echo "--- Premieres lignes du journal ---"
tail -n 12 run.log 2>/dev/null || echo "(journal en cours d'ecriture)"

cat <<'FIN'

============================================================
 MEMBRE VIVANT INSTALLE
 Verifier :            tmux attach -t ether        (Ctrl+B puis D pour sortir)
 Suivre le journal :   tail -f /root/alphatech-omniscience/genome/run.log
 Statut publie :       https://gelasegash-ship-it.github.io/alphatech-omniscience/agent-status.json
 Redemarrage auto :    bash /root/alphatech-omniscience/genome/vps-bootstrap.sh (relance tmux)
 Pour plusieurs membres sur la meme machine (cap 16) :
   for i in $(seq 2 5); do tmux new-session -d -s ether$i \
     "cd /root/alphatech-omniscience/genome && node agent.mjs" ; done
 NOTE : chaque VPS = 1 a 16 membres REELS. 10 000 membres = 625 VPS
        (ou 10 000 machines participantes, modele Bitcoin).
============================================================
FIN
