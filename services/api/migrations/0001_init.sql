-- GEONEX — schéma initial
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scénario : conditions générales réutilisables par plusieurs sessions.
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  summary TEXT,
  data JSONB NOT NULL,
  provider TEXT,
  parent_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenarios_owner ON scenarios(owner_id, mode);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine_job_id TEXT NOT NULL,
  params JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session : une partie particulière, avec son propre état du monde.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES scenarios(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  expected_teams INT NOT NULL,
  duration_minutes INT NOT NULL,
  creator_id UUID NOT NULL REFERENCES users(id),
  plan JSONB,
  seed BIGINT NOT NULL,
  runtime JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  actor_id TEXT,
  display_name TEXT NOT NULL,
  emblem TEXT NOT NULL,
  consent_comms BOOLEAN NOT NULL DEFAULT FALSE,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen TIMESTAMPTZ,
  absence_policy TEXT NOT NULL DEFAULT 'hold',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS world_states (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version INT NOT NULL,
  round INT NOT NULL,
  phase TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, version)
);

CREATE TABLE IF NOT EXISTS session_views (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, audience)
);

CREATE TABLE IF NOT EXISTS dossiers (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  data JSONB NOT NULL,
  opened_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, actor_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_round ON decisions(session_id, round);

CREATE TABLE IF NOT EXISTS president_requests (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  probability REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS card_uses (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  actor_id TEXT NOT NULL,
  card TEXT NOT NULL,
  engine_use_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  channel TEXT NOT NULL,
  from_actor TEXT NOT NULL,
  to_actor TEXT,
  content TEXT NOT NULL,
  analyzable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_round ON messages(session_id, round);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  a_actor TEXT NOT NULL,
  b_actor TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reports (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round INT NOT NULL,
  audience TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (session_id, round, audience)
);

CREATE TABLE IF NOT EXISTS rome_communiques (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  round INT NOT NULL,
  origin TEXT NOT NULL,
  payload JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, id)
);

CREATE TABLE IF NOT EXISTS archives (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal structuré (reconstitution des rounds, audit, diagnostic).
CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  actor TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS event_log_session ON event_log(session_id, id);

-- Consommation des services externes (IA, voix, hébergement).
CREATE TABLE IF NOT EXISTS usage_records (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID,
  service TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
