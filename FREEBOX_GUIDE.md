# Guide d'Auto-Hébergement Complet sur Freebox Delta (VM + Tailscale / WireGuard)

Ce guide explique comment héberger **100 % de Personal Vault Reader (Folio)** sur la machine virtuelle (VM) de votre **Freebox Delta** :
- **Site & API Node.js/Express**
- **Base de données PostgreSQL 16** (comptes, sessions, profils de coffre, progression, métadonnées)
- **Stockage disque chiffré (`vault_files`)** : tous les livres glissés-déposés sont chiffrés dans le navigateur en **AES-256-GCM** puis stockés sur le disque de la VM et synchronisés automatiquement entre tous vos appareils
- **Liaison Google Drive préservée** : vous pouvez combiner livres stockés sur la VM et livres/dossiers Google Drive
- **Accès extérieur ultra-sécurisé via Tailscale ou WireGuard** (aucun port exposé sur Internet public)

---

## 1. Se connecter en SSH à votre VM Freebox Delta

Depuis votre Mac, ouvrez le Terminal et connectez-vous à l'adresse IP locale de votre VM (visible dans **Freebox OS → Machines virtuelles**) :

```bash
ssh freebox@192.168.1.XX
```
*(Remplacez `freebox` et `192.168.1.XX` par l'identifiant et l'IP de votre VM).*

---

## 2. Récupérer le projet et lancer le déploiement automatique

Sur la VM Freebox, clonez le dépôt (ou copiez le dossier) et lancez le script [`deploy-freebox.sh`](./deploy-freebox.sh) :

```bash
sudo apt update && sudo apt install -y git curl openssl
git clone -b test-content https://github.com/axel-pixel-ux/personal-vault-reader.git
cd personal-vault-reader
chmod +x deploy-freebox.sh
./deploy-freebox.sh
```

Ce script effectue automatiquement :
1. L'installation de **Docker** et **Docker Compose** (architecture ARM64 de la Freebox Delta).
2. La génération de clés cryptographiques uniques (`POSTGRES_PASSWORD`, `JWT_SECRET`, `VAULT_KEK`) dans `.env` avec permissions restreintes (`chmod 600`).
3. Le démarrage de **PostgreSQL 16**, du **serveur Folio** et du volume de stockage chiffré `/data/vault-files`.
4. La création du script de sauvegarde `./backup-vault.sh`.

---

## 3. Configurer l'accès à distance sécurisé (Hors de votre réseau Wi-Fi)

> **Pourquoi le HTTPS est indispensable :** L'application chiffre et déchiffre vos livres dans le navigateur via l'API native `window.crypto.subtle` (WebCrypto AES-256-GCM). Les navigateurs (Safari iOS/macOS, Chrome, Firefox) exigent une connexion **HTTPS** dès que vous n'êtes plus sur `localhost`.

### Option A (Recommandée) : Tailscale avec HTTPS certifié automatique

1. **Sur la VM Freebox**, installez Tailscale et connectez-la à votre compte :
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
2. Dans votre console d'administration Tailscale ([login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns)) :
   - Vérifiez que **MagicDNS** est activé.
   - Cliquez sur **Enable HTTPS** en bas de la page DNS.
3. **Sur la VM Freebox**, activez le reverse-proxy HTTPS Tailscale en une seule commande :
   ```bash
   sudo tailscale serve --bg 3001
   ```
4. Tailscale affiche immédiatement votre adresse HTTPS privée (par ex. `https://freebox-vm.tail12345.ts.net`).
5. Installez l'application **Tailscale** sur votre Mac, iPhone, iPad ou Android : vous pouvez désormais accéder à `https://freebox-vm.tail12345.ts.net` **depuis n'importe où dans le monde (4G/5G, Wi-Fi extérieur, bureau)** avec un certificat HTTPS valide (Let's Encrypt) et sans ouvrir le moindre port sur votre Freebox !

---

### Option B : Serveur VPN WireGuard natif de la Freebox Delta

Si vous utilisez le serveur **WireGuard intégré à Freebox OS** (*Paramètres de la Freebox → Serveur VPN → WireGuard*) :
1. Le conteneur **Caddy** inclus dans [`docker-compose.yml`](./docker-compose.yml) expose déjà le site en **HTTPS sur le port 443** de l'IP locale de la VM (`https://192.168.1.XX`).
2. Dès que votre VPN WireGuard est actif sur votre téléphone ou ordinateur en déplacement, ouvrez simplement `https://192.168.1.XX`.

---

## 4. Conserver le lien Google Drive sur votre URL privée

Si vous utilisez la synchronisation Google Drive en complément du stockage sur la VM :
1. Ouvrez la modale **Google Drive** dans Folio : l'**URI de redirection** exacte de votre serveur (ex: `https://freebox-vm.tail12345.ts.net/auth/drive/callback`) s'affiche automatiquement.
2. Ajoutez cette URI dans les *URI de redirection autorisés* de votre client OAuth sur [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

---

## 5. Sauvegardes & Maintenance sur la Freebox

* **Lancer une sauvegarde complète (Base PostgreSQL + Livres chiffrés)** :
  ```bash
  ./backup-vault.sh
  ```
  Les archives `.sql.gz` et `.tar.gz` sont enregistrées dans `~/folio-backups` (que vous pouvez aussi pointer vers le disque dur NAS de votre Freebox Delta).
* **Automatiser la sauvegarde toutes les nuits à 3h00** :
  ```bash
  (crontab -l 2>/dev/null; echo "0 3 * * * cd $(pwd) && ./backup-vault.sh >> ~/folio-backups/backup.log 2>&1") | crontab -
  ```
* **Mettre à jour l'application** :
  ```bash
  git pull
  sudo docker compose up -d --build
  ```
