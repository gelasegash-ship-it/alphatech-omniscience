# Préparer le VPS — mode d'emploi

Tout est prêt côté code. Il manque une seule chose : la machine, parce qu'on ne loue pas un serveur sans moyen de paiement et que je ne touche jamais à tes cartes.

## 1. Choisir et commander (5 minutes, toi)

| Fournisseur | Prix | Ce que tu obtiens | Remarque |
|---|---|---|---|
| **Oracle Cloud Always Free** | 0 € | 4 cœurs ARM, 24 Go de RAM, 200 Go | Gratuit sans limite de durée. Le meilleur rapport, mais l'inscription demande une carte pour vérifier l'identité (jamais débitée). |
| **Hetzner CX22** | ~4,50 €/mois | 2 vCPU, 4 Go, 40 Go | Le plus simple, paiement par carte ou PayPal, serveur en 60 secondes. |
| **Contabo VPS S** | ~5 €/mois | 4 vCPU, 8 Go, 200 Go | Plus de RAM pour le même prix, mise en service plus lente. |

Ce qu'il faut choisir à la commande : **image Ubuntu 22.04 LTS**, 2 vCPU minimum, **2 Go de RAM minimum** (4 Go confortable), 20 Go de disque, et **clé SSH** si le fournisseur le propose.

Wazuh est gourmand : avec 1 Go de RAM l'indexeur tombera en panne. C'est la seule vraie contrainte technique.

## 2. Ce que tu m'envoies

Une fois le serveur créé, tu me donnes :

- l'**adresse IP**
- l'utilisateur (`root` ou `ubuntu`) et le **mot de passe**, ou mieux, tu ajoutes ma clé publique que je te génère

Je ne peux pas me connecter sans ça, et je ne le devine pas. Si tu préfères tout faire seul, la commande est en dessous, elle ne dépend pas de moi.

## 3. Installer (une commande, 15 minutes)

```bash
curl -fsSL https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/vps/vps-bootstrap.sh -o vps.sh
sha256sum vps.sh      # 966952de2c0e93ae642a17f16558b332f5f11f6577c9c4ddf30c6fbe578c54cf
sudo bash vps.sh
```

Le script enchaîne : mise à jour du système, pare-feu (22, 443, 1514-1515), fail2ban, mises à jour automatiques, **Wazuh tout-en-un**, les **9 règles ALPHATECH**, puis la **veille quotidienne à 7h**. Il journalise tout dans `/var/log/alphatech-bootstrap.log`.

Options : `--wazuh-only` (sans la veille), `--no-harden` (sans pare-feu, pour un serveur déjà protégé).

## 4. Vérifier

```bash
curl -fsSL https://gelasegash-ship-it.github.io/alphatech-omniscience/flux/vps/verify_vps.sh -o verif.sh
sudo bash verif.sh
```

Le script ne modifie rien : il constate l'état des services, le nombre de règles, les ports, la tâche planifiée, et affiche « Serveur conforme » ou la liste des échecs.

## 5. Ce que tu obtiendras

- Tableau de bord Wazuh sur `https://IP/`, utilisateur `admin`, mot de passe dans `/root/wazuh-install-files.tar`.
- Les 9 règles actives (ids 100600 à 100608).
- Les alertes dans `/var/ossec/logs/alerts/alerts.json`.
- La veille des accès qui tourne chaque matin.

## Deux avertissements que je ne veux pas enterrer

**Le durcissement SSH reste prudent.** Je n'ai pas désactivé l'authentification par mot de passe : le faire avant d'avoir testé une clé te verrouillerait dehors. C'est à toi de le faire après avoir posé ta clé.

**Les règles ne serviront à rien sans Sysmon.** Elles lisent `win.eventdata.*`. Sans collecte Sysmon ou canal Security sur tes postes Windows, Wazuh tournera à vide, correctement mais silencieusement. C'est la prochaine étape une fois le serveur debout.

---

## Voie Docker (SSH + Wazuh conteneurisé)

Deux scripts, deux rôles :

| Fichier | Quand l'utiliser | RAM requise |
|---|---|---|
| `vps-bootstrap.sh` | Wazuh installé directement (tout-en-un) | 2 Go |
| `setup-ssh-docker-wazuh.sh` | Wazuh en conteneurs, SSH durci | 4 Go |

Le script Docker : installe Docker et le plugin compose, applique `vm.max_map_count=262144` (sans quoi l'indexeur meurt), monte ufw sur 22/443/1514/1515/55000, active fail2ban, désactive le mot de passe SSH **seulement si une clé publique est déjà présente** (sinon il conserve le mot de passe et le dit), clone le dépôt officiel Wazuh v4.9.2, génère les certificats, crée un mot de passe indexeur aléatoire en `.env` (600), démarre la pile, puis installe les 9 règles ALPHATECH dans le manager et vérifie qu'elles sont bien 9 avant de le redémarrer.
