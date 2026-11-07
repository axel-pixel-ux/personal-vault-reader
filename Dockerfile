# ==============================================================================
# Stage 1 : Build Frontend (Vite) + Backend (esbuild)
# Compatible ARM64 (Freebox Delta aarch64) & AMD64
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ==============================================================================
# Stage 2 : Image de production minimale et sécurisée
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV VAULT_STORAGE_DIR=/data/vault-files

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Création du volume de stockage des livres chiffrés avec droits non-root
RUN mkdir -p /data/vault-files && chown -R node:node /data/vault-files /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1

CMD ["node", "dist/server.js"]
