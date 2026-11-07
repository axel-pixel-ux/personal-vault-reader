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
  echo -e "${YELLOW}[1/6] Installation de Docker et Docker Compose...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
else
  echo -e "${GREEN}[1/6] Docker est déjà installé.${NC}"
fi

# 2. Génération sécurisée du fichier .env s'il n'existe pas
if [ ! -f .env ]; then
  echo -e "${YELLOW}[2/6] Génération des clés cryptographiques dans .env...${NC}"
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
else
  echo -e "${GREEN}[2/6] Fichier .env existant détecté (clés conservées).${NC}"
fi

# 3. Génération du certificat TLS local multi-IP (pour https://192.168.1.50 et Tailscale IP)
mkdir -p certs
VM_IPS=$(hostname -I 2>/dev/null || echo "192.168.1.50")
SAN_LIST="DNS:localhost,IP:127.0.0.1,IP:192.168.1.50"
for ip in $VM_IPS; do
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$SAN_LIST" != *"IP:$ip"* ]]; then
    SAN_LIST="${SAN_LIST},IP:${ip}"
  fi
done

echo -e "${YELLOW}[3/6] Génération du certificat HTTPS pour (${SAN_LIST})...${NC}"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout certs/tls.key \
  -out certs/tls.crt \
  -subj "/CN=Folio Personal Vault" \
  -addext "subjectAltName=${SAN_LIST}" 2>/dev/null
chmod 644 certs/tls.crt certs/tls.key

# 4. Pare-feu UFW (si installé) : autoriser SSH, Tailscale, HTTP et HTTPS
if command -v ufw >/dev/null 2>&1; then
  echo -e "${YELLOW}[4/6] Vérification des règles de pare-feu UFW...${NC}"
  sudo ufw allow OpenSSH >/dev/null 2>&1 || true
  sudo ufw allow in on tailscale0 >/dev/null 2>&1 || true
  sudo ufw allow 80/tcp >/dev/null 2>&1 || true
  sudo ufw allow 443/tcp >/dev/null 2>&1 || true
else
  echo -e "${GREEN}[4/6] Étape pare-feu ignorée (ufw non actif).${NC}"
fi

# 5. Construction et lancement des conteneurs (PostgreSQL + App + Stockage + Caddy)
echo -e "${YELLOW}[5/6] Construction et démarrage des conteneurs Docker...${NC}"
sudo docker compose up -d --build --force-recreate caddy

# 6. Mise en place d'un script de sauvegarde locale (Base PostgreSQL + Livres chiffrés)
echo -e "${YELLOW}[6/6] Création du script de sauvegarde ./backup-vault.sh...${NC}"
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

FIRST_IP=$(echo "$VM_IPS" | awk '{print $1}')
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}✅ Folio est déployé et opérationnel sur votre VM Freebox !${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "👉 Accès immédiat sur votre réseau local : ${BLUE}https://${FIRST_IP:-192.168.1.50}${NC}"
echo -e "👉 Pour l'accès extérieur via Tailscale : ${BLUE}sudo tailscale serve --bg 3001${NC}"
