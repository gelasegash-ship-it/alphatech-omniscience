#!/usr/bin/env bash
# ALPHATECH — préparation SSH + Docker + Wazuh single-node
# Ubuntu 22.04/24.04 ou Debian 12. À lancer en root.
set -euo pipefail
LOG=/var/log/alphatech-setup.log
exec > >(tee -a "$LOG") 2>&1
echo "[$(date -Is)] démarrage"

[ "$(id -u)" -eq 0 ] || { echo "REFUS: lancer avec sudo"; exit 1; }
command -v apt-get >/dev/null || { echo "REFUS: distribution non Debian/Ubuntu"; exit 1; }

RAM=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
echo "RAM détectée: ${RAM} Mo"
if [ "$RAM" -lt 3800 ]; then
  echo "REFUS: la pile Docker Wazuh (manager + indexeur + dashboard) exige ~4 Go."
  echo "      2 Go suffisent pour l'installation tout-en-un sans Docker."
  exit 1
fi

# --- 1. Paquets de base ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg jq ufw fail2ban unattended-upgrades git >/dev/null

# --- 2. Docker + plugin compose ---
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker
docker --version
docker compose version

# --- 3. Mémoire noyau exigée par l'indexeur ---
sysctl -w vm.max_map_count=262144 >/dev/null
grep -q "vm.max_map_count" /etc/sysctl.conf || echo "vm.max_map_count=262144" >> /etc/sysctl.conf
echo "vm.max_map_count=262144"

# --- 4. Pare-feu et anti-force brute ---
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in 22/tcp 443/tcp 1514/tcp 1515/tcp 55000/tcp; do ufw allow "$p" >/dev/null; done
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
cat > /etc/fail2ban/jail.d/sshd.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime  = 1h
JAIL
systemctl restart fail2ban

# --- 5. SSH : clé obligatoire, mais sans se verrouiller dehors ---
KEYFILE=/root/.ssh/authorized_keys
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [ -s "$KEYFILE" ]; then
  cp -n /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-alphatech || true
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  sshd -t && systemctl reload ssh && echo "SSH: clé obligatoire activée"
else
  echo "SSH: mot de passe CONSERVÉ (aucune clé trouvée). Ajouter la clé puis relancer ce script."
fi

# --- 6. Wazuh single-node en Docker ---
mkdir -p /opt/alphatech && cd /opt/alphatech
if [ ! -d wazuh-docker ]; then
  git clone -q --depth 1 -b v4.9.2 https://github.com/wazuh/wazuh-docker.git
fi
cd wazuh-docker/single-node
if [ ! -f config/wazuh_indexer_ssl_certs/root-ca.pem ]; then
  docker compose -f generate-indexer-certs.yml run --rm generator
fi
if [ ! -f .env ]; then
  PW=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  printf 'INDEXER_PASSWORD=%s\n' "$PW" > .env
  chmod 600 .env
  echo "Mot de passe indexeur généré et stocké dans /opt/alphatech/wazuh-docker/single-node/.env (600)"
fi
set -a; . ./.env; set +a
docker compose up -d
sleep 60
docker compose ps

# --- 7. Nos 9 règles dans le manager ---
if docker ps --format '{{.Names}}' | grep -q wazuh.manager; then
  curl -fsSL "https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/wazuh_alphatech_rules.xml" \
    -o /tmp/alphatech_rules.xml
  N=$(grep -c '<rule id=' /tmp/alphatech_rules.xml || echo 0)
  if [ "$N" -eq 9 ]; then
    docker cp /tmp/alphatech_rules.xml wazuh.manager:/var/ossec/etc/rules/alphatech_sentinel.xml
    docker exec wazuh.manager chown wazuh:wazuh /var/ossec/etc/rules/alphatech_sentinel.xml
    docker exec wazuh.manager chmod 640 /var/ossec/etc/rules/alphatech_sentinel.xml
    docker exec wazuh.manager /var/ossec/bin/wazuh-control restart
    echo "9 règles installées et manager redémarré."
  else
    echo "ATTENTION: $N règles téléchargées au lieu de 9, rien n'a été installé."
  fi
else
  echo "Manager non démarré: règles non installées."
fi

echo "[$(date -Is)] terminé"
echo "Dashboard: https://IP_DU_SERVEUR (admin / mot de passe du .env)"
echo "Vérification: docker compose ps doit montrer 3 services healthy"
