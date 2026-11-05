import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://vault:vault@localhost:5432/vault',
});

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      CHAR(64) NOT NULL UNIQUE,
  prev_token_hash CHAR(64),
  rotated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_name     TEXT NOT NULL,
  user_agent      TEXT,
  ip              INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ
);
-- Un seul profil de coffre (prénom + clé) par compte
CREATE TABLE IF NOT EXISTS vault_profiles (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,              -- JSON chiffré AES-256-GCM (clé serveur VAULT_KEK)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connexion OAuth Google Drive propre à chaque utilisateur (jetons chiffrés AES-256-GCM)
CREATE TABLE IF NOT EXISTS drive_connections (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  oauth_config_sealed TEXT,              -- Client ID / Secret optionnels chiffrés
  tokens_sealed       TEXT,              -- Access / Refresh tokens Google chiffrés
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dossiers Google Drive liés (synchronisation de toute une bibliothèque en un lien)
CREATE TABLE IF NOT EXISTS drive_folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id_sealed  TEXT NOT NULL,
  folder_hash       CHAR(64) NOT NULL,
  name              TEXT NOT NULL,
  default_category  TEXT NOT NULL DEFAULT 'Essais',
  books_count       INT NOT NULL DEFAULT 0,
  last_synced_at    BIGINT NOT NULL,
  UNIQUE (user_id, folder_hash)
);

-- Livres liés depuis Google Drive (0 octet de fichier stocké sur le serveur, isolé par user_id)
CREATE TABLE IF NOT EXISTS drive_books (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drive_file_id_sealed   TEXT NOT NULL,  -- ID Google Drive chiffré AES-256-GCM
  file_hash              CHAR(64),
  folder_ref             UUID REFERENCES drive_folders(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  author                 TEXT,
  description            TEXT NOT NULL DEFAULT '',
  category               TEXT NOT NULL DEFAULT 'Essais',
  is_favorite            BOOLEAN NOT NULL DEFAULT false,
  bookmarks_count        INT NOT NULL DEFAULT 0,
  annotations_count      INT NOT NULL DEFAULT 0,
  original_name          TEXT NOT NULL,
  format                 TEXT NOT NULL,
  size                   BIGINT NOT NULL DEFAULT 0,
  added_at               BIGINT NOT NULL,
  last_opened_at         BIGINT,
  progress               JSONB NOT NULL DEFAULT '{"percentage":0,"updatedAt":0}',
  annotations_iv         TEXT,
  encrypted_annotations  TEXT
);
ALTER TABLE drive_books ADD COLUMN IF NOT EXISTS file_hash CHAR(64);
ALTER TABLE drive_books ADD COLUMN IF NOT EXISTS folder_ref UUID REFERENCES drive_folders(id) ON DELETE CASCADE;
ALTER TABLE drive_books ADD COLUMN IF NOT EXISTS cover_data_url TEXT;
CREATE INDEX IF NOT EXISTS drive_books_user_idx ON drive_books (user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS drive_books_hash_idx ON drive_books (user_id, file_hash);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_prev_hash_idx ON sessions (prev_token_hash);
`;

export async function migrate() {
  await pool.query(SCHEMA);
}

/** Purge les sessions expirées ou révoquées depuis plus de 7 jours. */
export async function cleanupSessions() {
  await pool.query(
    `DELETE FROM sessions
      WHERE expires_at < now() - interval '7 days'
         OR revoked_at < now() - interval '7 days'`,
  );
}
