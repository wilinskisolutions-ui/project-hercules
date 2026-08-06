-- Applied remotely via Supabase MCP (create_ledger_tables + settings_passphrase_column + private_passphrase_secret)
-- Kept here for repo documentation / local reference.

CREATE TABLE IF NOT EXISTS settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  calories_target integer NOT NULL DEFAULT 2600,
  protein_target integer NOT NULL DEFAULT 200,
  height_in numeric NOT NULL DEFAULT 75,
  updated_at timestamptz NOT NULL DEFAULT now(),
  passphrase text
);

INSERT INTO settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE settings SET passphrase = COALESCE(NULLIF(passphrase, ''), 'EMIL') WHERE id = 1;

CREATE TABLE IF NOT EXISTS daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  weight numeric NOT NULL,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  shoulder numeric NOT NULL,
  waist numeric NOT NULL,
  chest numeric NOT NULL,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  split text NOT NULL,
  exercise text NOT NULL DEFAULT '',
  weight numeric,
  sets integer,
  reps integer,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workouts_date_idx ON workouts (date);

CREATE TABLE IF NOT EXISTS adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  calories integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;
