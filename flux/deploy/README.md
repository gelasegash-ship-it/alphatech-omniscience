# Déploiement des 9 règles ALPHATECH dans Wazuh

État au 5 novembre 2026. Ce dossier contient tout ce qu'il faut pour installer les règles sur un manager Wazuh. Il manque une seule chose, et elle n'est pas technique : **un serveur Wazuh qui existe**.

## Ce qui est prêt

| Fichier | Rôle |
|---|---|
| `install_wazuh_alphatech.sh` | installe les règles, vérifie le XML, sauvegarde l'existant, redémarre le manager |
| `../wazuh_alphatech_rules.xml` | les 9 règles, ids 100600 à 100608, niveaux 10 et 12 |

Empreinte du script d'installation : `cd1ad257ba8a5140ac9c5e6315733eb1b6ef4da7c88fa3998b027764f786035d`

## Route 1 — sur un manager Wazuh déjà en service

```bash
curl -fsSL https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/deploy/install_wazuh_alphatech.sh -o install.sh
sha256sum install.sh          # doit afficher l'empreinte ci-dessus
sudo bash install.sh
```

Le script refuse de s'exécuter si `/var/ossec` est absent, sauvegarde le fichier précédent, vérifie le XML avant de l'installer, puis redémarre `wazuh-manager` et confirme qu'il tourne.

## Route 2 — créer le manager sur un VPS Ubuntu 22.04 (2 Go de RAM minimum)

```bash
# sur le VPS
curl -sO https://packages.wazuh.com/4.9/wazuh-install.sh
sudo bash wazuh-install.sh -a          # installation tout-en-un, ~10 min
sudo grep -A2 "admin" /root/wazuh-install-files.tar 2>/dev/null || echo "identifiants dans wazuh-install-files.tar"
```

Puis la route 1 sur la même machine.

## Route 3 — Docker, pour tester sans VPS

```bash
git clone https://github.com/wazuh/wazuh-docker.git -b v4.9.0
cd wazuh-docker/single-node
docker compose -f generate-indexer-certs.yml run --rm generator
docker compose up -d
# puis, dans le conteneur manager :
docker cp wazuh_alphatech_rules.xml single-node-wazuh.manager-1:/var/ossec/etc/rules/alphatech_sentinel.xml
docker exec -u root single-node-wazuh.manager-1 systemctl restart wazuh-manager
```

Attention : `systemctl` n'existe pas dans le conteneur, utiliser `/var/ossec/bin/wazuh-control restart`.

## Prérequis sans lesquels rien ne se déclenchera

Les 9 règles lisent `win.eventdata.*`. Sans collecte **Sysmon** ou du **canal Security** sur les postes Windows, elles resteront muettes. Ce n'est pas un défaut des règles, c'est la source qui manque.

Vérification d'un déclenchement, après avoir branché Sysmon :

```bash
sudo /var/ossec/bin/wazuh-logtest
# coller une alerte Sysmon EventID 10 visant lsass.exe : la règle 100600 doit apparaître
```

## Ce qui n'est pas fait, et pourquoi

Aucun déploiement n'a été exécuté à ce jour : il n'existe ni VPS actif ni manager Wazuh accessible depuis mon environnement (aucune clé SSH, aucun hôte configuré, pas de Docker). Le paquet ci-dessus est prêt, testé syntaxiquement, mais il attend la machine.
