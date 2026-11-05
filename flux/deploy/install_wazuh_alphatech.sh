#!/usr/bin/env bash
# ALPHATECH SENTINEL — installation des 9 regles Wazuh sur un manager existant.
# Usage sur le serveur Wazuh (root) :
#   curl -fsSL https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/deploy/install_wazuh_alphatech.sh | sudo bash
# ou, plus prudent :
#   sudo bash install_wazuh_alphatech.sh
set -euo pipefail

RULES_URL="https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/wazuh_alphatech_rules.xml"
DEST="/var/ossec/etc/rules/alphatech_sentinel.xml"
EXPECTED_RULES=9

say() { printf '\n[ALPHATECH] %s\n' "$*"; }
die() { printf '\n[ALPHATECH] ECHEC : %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "a lancer en root (sudo)."

if [ ! -d /var/ossec ]; then
  die "aucun manager Wazuh ici (/var/ossec absent). Installe d'abord Wazuh, puis relance ce script."
fi
command -v systemctl >/dev/null || say "systemctl absent : le redemarrage devra etre fait a la main."

say "1/5 sauvegarde de la configuration existante"
STAMP=$(date +%Y%m%d-%H%M%S)
if [ -f "$DEST" ]; then
  cp -a "$DEST" "${DEST}.bak-${STAMP}"
  say "   ancien fichier conserve : ${DEST}.bak-${STAMP}"
else
  say "   aucun fichier precedent, premiere installation"
fi
tar czf "/root/wazuh-rules-backup-${STAMP}.tgz" /var/ossec/etc/rules 2>/dev/null || true

say "2/5 telechargement des regles"
TMP=$(mktemp)
if ! curl -fsSL --max-time 60 "$RULES_URL" -o "$TMP"; then
  die "telechargement impossible. Verifie la connexion, puis relance."
fi
COUNT=$(grep -c '<rule id=' "$TMP" || true)
[ "$COUNT" -eq "$EXPECTED_RULES" ] || die "fichier inattendu : $COUNT regles au lieu de $EXPECTED_RULES."

say "3/5 verification XML"
if command -v xmllint >/dev/null; then
  xmllint --noout "$TMP" || die "XML invalide, rien n'a ete installe."
  say "   XML valide (xmllint)"
else
  python3 -c "import xml.etree.ElementTree as E,sys;E.parse(sys.argv[1])" "$TMP" 2>/dev/null \
    || die "XML invalide ou python3 absent, rien n'a ete installe."
  say "   XML valide (ElementTree)"
fi

say "4/5 installation"
install -m 0640 -o root -g wazuh "$TMP" "$DEST" 2>/dev/null || install -m 0640 "$TMP" "$DEST"
rm -f "$TMP"
say "   regles installees : $DEST ($COUNT regles)"

say "5/5 redemarrage du manager"
if command -v systemctl >/dev/null; then
  systemctl restart wazuh-manager
  sleep 5
  if systemctl is-active --quiet wazuh-manager; then
    say "   manager actif"
  else
    die "le manager ne redemarre pas. Restaure : cp ${DEST}.bak-${STAMP} $DEST puis systemctl restart wazuh-manager"
  fi
else
  /var/ossec/bin/wazuh-control restart || say "   redemarrage manuel necessaire"
fi

say "termine. Les 9 regles sont chargees (ids 100600 a 100608)."
say "Controle des alertes : /var/ossec/logs/alerts/alerts.json  ou  /var/ossec/bin/wazuh-logtest"
say "Prerequis pour que les regles se declenchent : Sysmon (ou le canal Security) doit etre collecte."
