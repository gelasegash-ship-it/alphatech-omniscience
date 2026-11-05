#!/usr/bin/env bash
# ALPHATECH — preparation complete d'un VPS neuf (Ubuntu 22.04/24.04 ou Debian 12).
# Installe : durcissement de base, Wazuh tout-en-un, les 9 regles ALPHATECH, la veille quotidienne.
#
# Usage :
#   sudo bash vps-bootstrap.sh              # tout
#   sudo bash vps-bootstrap.sh --wazuh-only # Wazuh + regles, sans la veille
#   sudo bash vps-bootstrap.sh --no-harden  # sans pare-feu ni fail2ban
set -euo pipefail

LOG=/var/log/alphatech-bootstrap.log
exec > >(tee -a "$LOG") 2>&1
STAMP=$(date '+%Y-%m-%d %H:%M:%S')
BASE="https://gelasegash-ship-it.github.io/alphatech-omniscience"
RULES_SCRIPT="$BASE/flux/deploy/install_wazuh_alphatech.sh"
SURV_SCRIPT="$BASE/flux/deploy/build_surveillance.py"

WAZUH_ONLY=0; HARDEN=1
for a in "$@"; do
  case "$a" in
    --wazuh-only) WAZUH_ONLY=1 ;;
    --no-harden) HARDEN=0 ;;
    *) echo "option inconnue: $a"; exit 2 ;;
  esac
done

say()  { printf '\n=== [%s] %s\n' "$(date +%H:%M)" "$*"; }
ok()   { printf '    OK   %s\n' "$*"; }
warn() { printf '    ATTENTION %s\n' "$*"; }
die()  { printf '\n    ECHEC %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "a lancer en root (sudo bash $0)"
. /etc/os-release 2>/dev/null || die "/etc/os-release introuvable, distribution non reconnue"
case "${ID:-}" in ubuntu|debian) ;; *) die "distribution ${ID:-inconnue} non prise en charge (Ubuntu ou Debian requis)" ;; esac

MEM_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
say "machine : ${PRETTY_NAME:-$ID} · $(nproc) coeurs · ${MEM_MB} Mo de RAM · $(df -h / | awk 'NR==2{print $4}') libres sur /"
[ "$MEM_MB" -ge 1900 ] || warn "Wazuh tout-en-un demande 2 Go minimum. Avec ${MEM_MB} Mo, l'indexeur risque de manquer de memoire."
[ "$(df -m / | awk 'NR==2{print $4}')" -ge 20000 ] || warn "moins de 20 Go libres : Wazuh en consomme une partie."

say "1. mise a jour du systeme"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget jq ca-certificates gnupg ufw fail2ban unattended-upgrades python3 >/dev/null
ok "paquets de base installes"

if [ "$HARDEN" -eq 1 ]; then
  say "2. durcissement reseau (sans jamais couper l'acces SSH)"
  ufw --force reset >/dev/null 2>&1 || true
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp comment 'SSH' >/dev/null
  ufw allow 443/tcp comment 'Wazuh dashboard' >/dev/null
  ufw allow 1514:1515/tcp comment 'Wazuh agents' >/dev/null
  ufw --force enable >/dev/null
  ok "pare-feu actif : 22, 443, 1514-1515"
  warn "l'authentification par mot de passe SSH est CONSERVEE pour ne pas te verrouiller. Ajoute ta cle, teste, puis durcis toi-meme."
  systemctl enable --now fail2ban >/dev/null 2>&1 || warn "fail2ban non demarre"
  ok "fail2ban actif (protection contre le bourrage de mots de passe)"
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
  ok "mises a jour de securite automatiques"
else
  say "2. durcissement ignore (--no-harden)"
fi

if command -v /var/ossec/bin/wazuh-control >/dev/null 2>&1; then
  say "3. Wazuh deja present, installation sautee"
else
  say "3. installation de Wazuh tout-en-un (10 a 20 minutes)"
  cd /root
  curl -fsSL -o wazuh-install.sh https://packages.wazuh.com/4.9/wazuh-install.sh || die "telechargement de l'installateur Wazuh impossible"
  bash wazuh-install.sh -a -i || die "installation Wazuh interrompue. Journal : /var/log/wazuh-install.log"
  if [ -f wazuh-install-files.tar ]; then
    tar xf wazuh-install-files.tar
    chmod 600 wazuh-install-files.tar
    ok "identifiants conserves dans /root/wazuh-install-files.tar (a sauvegarder hors du serveur)"
  fi
fi

say "4. installation des 9 regles ALPHATECH"
if [ -d /var/ossec ]; then
  curl -fsSL -o /tmp/install_rules.sh "$RULES_SCRIPT" || die "script de regles inaccessible"
  bash /tmp/install_rules.sh || die "installation des regles echouee"
  N=$(grep -c '<rule id=' /var/ossec/etc/rules/alphatech_sentinel.xml 2>/dev/null || echo 0)
  ok "$N regles presentes dans /var/ossec/etc/rules/alphatech_sentinel.xml"
else
  warn "/var/ossec absent, etape des regles sautee"
fi

if [ "$WAZUH_ONLY" -eq 0 ]; then
  say "5. veille quotidienne des acces"
  mkdir -p /opt/alphatech
  if curl -fsSL -o /opt/alphatech/build_surveillance.py "$SURV_SCRIPT"; then
    chmod +x /opt/alphatech/build_surveillance.py
    ( crontab -l 2>/dev/null | grep -v build_surveillance.py
      echo "0 7 * * * cd /opt/alphatech && python3 build_surveillance.py >> /var/log/alphatech-veille.log 2>&1" ) | crontab -
    ok "controle quotidien programme a 7h00"
    warn "ce script a besoin du jeton GitHub du depot pour lire le trafic : renseigne-le avant de te fier a la sortie"
  else
    warn "script de veille non telecharge, etape sautee"
  fi
fi

say "6. recapituatif"
for s in wazuh-manager wazuh-indexer wazuh-dashboard; do
  systemctl is-active --quiet "$s" 2>/dev/null && ok "$s actif" || warn "$s inactif ou absent"
done
IP=$(hostname -I | awk '{print $1}')
cat <<EOF

    Adresse du tableau de bord : https://${IP}/
    Utilisateur : admin
    Mot de passe : dans /root/wazuh-install-files.tar  (tar xf puis voir wazuh-passwords.txt)
    Pare-feu : $(ufw status 2>/dev/null | head -1)

    Etat des alertes : /var/ossec/logs/alerts/alerts.json
    Test d'une regle : /var/ossec/bin/wazuh-logtest
    Journal complet de cette installation : $LOG

    Il reste une chose, et elle n'est pas technique : Sysmon (ou le canal
    Security) doit etre collecte sur les postes Windows, sinon les 9 regles
    resteront muettes.
EOF
say "termine ($STAMP)"
