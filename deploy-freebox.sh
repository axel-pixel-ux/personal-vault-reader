#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de déploiement automatique — Personal Vault Reader (Folio)
# Cible : VM Freebox Delta (Debian / Ubuntu ARM64)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Déploiement de Personal Vault Reader (Folio) sur Freebox Delta ===${NC}"

# 1. Installation de Docker si absent
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}[1/5] Installation de Docker et Docker Compose...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
else
  echo -e "${GREEN}[1/5] Docker est déjà installé.${NC}"
fi

# 2. Génération sécurisée du fichier .env s'il n'existe pas
if [ ! -f .env ]; then
  echo -e "${YELLOW}[2/5] Génération des clés cryptographiques dans .env...${NC}"
  DB_PASS=$(openssl rand -hex 24)
  JWT_SEC=$(openssl rand -hex 32)
  KEK_HEX=$(openssl rand -hex 32) # 64 caractères hex (256 bits)

  cat > .env <<EOF
POSTGRES_USER=vault
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=vault
DATABASE_URL=postgres://vault:${DB_PASS}@db:5432/vault
JWT_SECRET=${JWT_SEC}
VAULT_KEK=${KEK_HEX}
VAULT_STORAGE_DIR=/data/vault-files
DOMAIN_NAME=localhost
APP_URL=
EOF
  chmod 600 .env
  echo -e "${GREEN}Fichier .env créé et verrouillé (chmod 600).${NC}"
  echo -e "${YELLOW}IMPORTANT : Conservez une copie de votre fichier .env (notamment VAULT_KEK) en lieu sûr.${NC}"
else
  echo -e "${GREEN}[2/5] Fichier .env existant détecté (clés conservées).${NC}"
fi

# 3. Pare-feu UFW (si installé) : autoriser SSH, Tailscale et HTTPS local
if command -v ufw >/dev/null 2>&1; then
  echo -e "${YELLOW}[3/5] Vérification des règles de pare-feu UFW...${NC}"
  sudo ufw allow OpenSSH >/dev/null 2>&1 || true
  sudo ufw allow in on tailscale0 >/dev/null 2>&1 || true
  sudo ufw allow 443/tcp >/dev/null 2>&1 || true
else
  echo -e "${GREEN}[3/5] Étape pare-feu ignorée (ufw non actif).${NC}"
fi

# 4. Construction et lancement des conteneurs (PostgreSQL + App + Stockage + Caddy)
echo -e "${YELLOW}[4/5] Construction et démarrage des conteneurs Docker...${NC}"
sudo docker compose up -d --build

# 5. Mise en place d'un script de sauvegarde locale (Base PostgreSQL + Livres chiffrés)
echo -e "${YELLOW}[5/5] Création du script de sauvegarde ./backup-vault.sh...${NC}"
cat > backup-vault.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${HOME}/folio-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "${BACKUP_DIR}"

# 1. Dump de la base PostgreSQL
docker compose exec -T db pg_dump -U vault vault | gzip > "${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"

# 2. Archive des livres chiffrés (AES-256-GCM)
docker compose run --rm -v "${BACKUP_DIR}:/backup" app \
  tar czf "/backup/vault_files_${TIMESTAMP}.tar.gz" -C /data/vault-files .

# Conservation des 14 dernières sauvegardes
ls -1t "${BACKUP_DIR}"/db_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t "${BACKUP_DIR}"/vault_files_*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Sauvegarde terminée dans ${BACKUP_DIR} (${TIMESTAMP})"
EOF
chmod +x backup-vault.sh

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}✅ Folio est déployé et opérationnel sur votre VM Freebox !${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "Prochaine étape pour l'accès extérieur sécurisé via Tailscale (HTTPS certifié) :"
echo -e "  1. Installez Tailscale : ${BLUE}curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up${NC}"
echo -e "  2. Activez le proxy HTTPS : ${BLUE}sudo tailscale serve --bg 3001${NC}"
echo -e "  3. Ouvrez l'URL affichée (du type ${BLUE}https://nom-vm.tailxxxx.ts.net${NC}) depuis vos appareils !"
