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

-- Livres glissés-déposés stockés chiffrés (AES-256-GCM client) sur le disque du serveur / VM
CREATE TABLE IF NOT EXISTS vault_books (
  id                    UUID PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  author                TEXT,
  description           TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT 'Essais',
  is_favorite           BOOLEAN NOT NULL DEFAULT false,
  bookmarks_count       INT NOT NULL DEFAULT 0,
  annotations_count     INT NOT NULL DEFAULT 0,
  original_name         TEXT NOT NULL,
  format                TEXT NOT NULL,
  size                  BIGINT NOT NULL DEFAULT 0,
  cipher_size           BIGINT NOT NULL DEFAULT 0,
  iv_hex                TEXT NOT NULL,
  storage_rel_path      TEXT NOT NULL,
  added_at              BIGINT NOT NULL,
  last_opened_at        BIGINT,
  progress              JSONB NOT NULL DEFAULT '{"percentage":0,"updatedAt":0}',
  annotations_iv        TEXT,
  encrypted_annotations TEXT,
  cover_data_url        TEXT
);
CREATE INDEX IF NOT EXISTS vault_books_user_idx ON vault_books (user_id, added_at DESC);

-- Jetons de réinitialisation de mot de passe (seul le hash SHA-256 est stocké, usage unique)
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_prev_hash_idx ON sessions (prev_token_hash);

-- ============================================================================
-- Tables dédiées au site « Études » (strictement séparées des livres de Folio)
-- ============================================================================
CREATE TABLE IF NOT EXISTS etudes_articles (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  subtitle       TEXT NOT NULL DEFAULT '',
  author         TEXT NOT NULL DEFAULT '',
  issue_ref      TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  cover_data_url TEXT,
  open_count     INT NOT NULL DEFAULT 0,
  added_at       BIGINT NOT NULL,
  last_opened_at BIGINT
);
CREATE INDEX IF NOT EXISTS etudes_articles_user_idx ON etudes_articles (user_id, added_at DESC);

CREATE TABLE IF NOT EXISTS etudes_versions (
  id                    UUID PRIMARY KEY,
  article_id            UUID NOT NULL REFERENCES etudes_articles(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_label         TEXT NOT NULL DEFAULT 'VF',
  original_name         TEXT NOT NULL,
  format                TEXT NOT NULL,
  size                  BIGINT NOT NULL DEFAULT 0,
  cipher_size           BIGINT NOT NULL DEFAULT 0,
  iv_hex                TEXT NOT NULL,
  storage_rel_path      TEXT NOT NULL,
  added_at              BIGINT NOT NULL,
  last_opened_at        BIGINT,
  progress              JSONB NOT NULL DEFAULT '{"percentage":0,"updatedAt":0}',
  bookmarks_count       INT NOT NULL DEFAULT 0,
  annotations_count     INT NOT NULL DEFAULT 0,
  annotations_iv        TEXT,
  encrypted_annotations TEXT
);
CREATE INDEX IF NOT EXISTS etudes_versions_article_idx ON etudes_versions (article_id, added_at ASC);
CREATE INDEX IF NOT EXISTS etudes_versions_user_idx ON etudes_versions (user_id);

CREATE TABLE IF NOT EXISTS etudes_lists (
  id          TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge       TEXT NOT NULL DEFAULT 'Liste personnelle',
  title       TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  article_ids JSONB NOT NULL DEFAULT '[]',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS etudes_lists_user_idx ON etudes_lists (user_id, created_at ASC);

DELETE FROM vault_books WHERE category IN ('Revue Études', 'Études');
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
