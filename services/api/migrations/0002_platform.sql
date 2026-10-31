-- GEONEX — plateforme : comptes vérifiés, jetons à usage unique, favoris, invitations, notifications, publication de scénarios.
-- Migration CONSERVATRICE : aucune donnée existante n'est supprimée ni réattribuée.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;   -- incrémenté pour révoquer toutes les sessions
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}'::jsonb;  -- avatar, notifications

-- Unicité du pseudonyme (comptes enregistrés). Les doublons éventuels de la v1 sont d'abord départagés par un suffixe : le plus ancien
-- compte garde son pseudonyme, les autres reçoivent « -xxxx » (aucun compte n'est supprimé).
UPDATE users u SET display_name = left(u.display_name, 19) || '-' || substr(replace(u.id::text, '-', ''), 1, 4)
FROM (
  SELECT id, row_number() OVER (PARTITION BY lower(display_name) ORDER BY created_at, id) AS rn
  FROM users WHERE is_guest = false AND deleted_at IS NULL
) d
WHERE u.id = d.id AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS users_pseudonym_unique ON users (lower(display_name)) WHERE is_guest = false AND deleted_at IS NULL;

-- Jetons de vérification d'adresse, de changement d'adresse et de réinitialisation : seul l'empreinte (SHA-256) est conservée.
CREATE TABLE IF NOT EXISTS email_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- verify | reset | email_change
  token_hash TEXT NOT NULL UNIQUE,
  new_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens(user_id, kind, created_at);

-- Journal des e-mails transactionnels : l'état affiché à l'utilisateur est l'état réel (envoyé, échoué, non configuré).
CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  to_email TEXT NOT NULL,
  status TEXT NOT NULL,               -- sent | failed | skipped
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Favoris : `scenario_key` = identifiant d'une fiche officielle (ex. cuba-1962) ou « user:<uuid> » pour un scénario communautaire publié.
CREATE TABLE IF NOT EXISTS scenario_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_key)
);

-- Publication : un scénario est privé par défaut ; la publication passe par une vérification (statut « pending »).
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';          -- private | public
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'none';     -- none | pending | published | rejected
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS publication JSONB;                                   -- titre, description, mots-clés proposés
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE INDEX IF NOT EXISTS scenarios_publication ON scenarios(publication_status, visibility);

-- Invitations à une session (en complément du code de participation, qui reste inchangé).
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user UUID REFERENCES users(id) ON DELETE CASCADE,
  to_email TEXT,
  token_hash TEXT UNIQUE,
  kind TEXT NOT NULL,                 -- user | email | link
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined | revoked | expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invitations_to_user ON invitations(to_user, status);
CREATE INDEX IF NOT EXISTS invitations_session ON invitations(session_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- invitation_received | invitation_accepted | invitation_declined
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at, created_at);

-- Archivage par l'organisateur (masque la session de sa liste sans rien supprimer) et signalements de scénarios publics.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- open | closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
