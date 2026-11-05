#!/usr/bin/env bash
# ALPHATECH — verification d'un VPS apres installation. Ne modifie rien, ne fait que constater.
# Usage : sudo bash verify_vps.sh
set -uo pipefail
P=0; F=0
t() { # t "libelle" commande...
  local lib="$1"; shift
  if "$@" >/dev/null 2>&1; then printf '  [OK]    %s\n' "$lib"; P=$((P+1)); else printf '  [ECHEC] %s\n' "$lib"; F=$((F+1)); fi
}

echo "ALPHATECH — verification du serveur · $(date '+%d/%m/%Y %H:%M')"
echo
echo "MACHINE"
echo "  $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") · $(nproc) coeurs · $(awk '/MemTotal/{printf "%d Mo", $2/1024}' /proc/meminfo) · $(df -h / | awk 'NR==2{print $4}') libres"

echo
echo "SERVICES"
for s in wazuh-manager wazuh-indexer wazuh-dashboard fail2ban cron; do
  t "$s actif" systemctl is-active --quiet "$s"
done

echo
echo "REGLES"
if [ -f /var/ossec/etc/rules/alphatech_sentinel.xml ]; then
  N=$(grep -c '<rule id=' /var/ossec/etc/rules/alphatech_sentinel.xml)
  if [ "$N" -eq 9 ]; then echo "  [OK]    9 regles installees"; P=$((P+1)); else echo "  [ECHEC] $N regles au lieu de 9"; F=$((F+1)); fi
else
  echo "  [ECHEC] fichier de regles absent"; F=$((F+1))
fi
t "regles chargees par le manager" bash -c 'test -f /var/ossec/logs/ossec.log && ! grep -qi "error.*alphatech_sentinel" /var/ossec/logs/ossec.log'

echo
echo "RESEAU"
t "pare-feu actif" bash -c 'ufw status | grep -q "Status: active"'
t "port 443 ouvert" bash -c 'ufw status | grep -q "443"'
t "port 1514 ouvert (agents)" bash -c 'ufw status | grep -q "1514"'
t "SSH joignable" bash -c 'systemctl is-active --quiet ssh || systemctl is-active --quiet sshd'

echo
echo "VEILLE"
t "controle quotidien programme" bash -c 'crontab -l 2>/dev/null | grep -q build_surveillance'

echo
echo "RESULTAT : $P reussites, $F echecs"
if [ "$F" -gt 0 ]; then
  echo
  echo "Pistes : journal /var/log/alphatech-bootstrap.log · etat detaille systemctl status wazuh-manager"
fi
[ "$F" -eq 0 ] && echo "Serveur conforme."
