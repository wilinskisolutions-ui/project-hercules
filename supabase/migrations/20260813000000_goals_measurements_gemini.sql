-- Additive schema for goals, optional tape fields, and Gemini API key.
-- Does not DROP/TRUNCATE/DELETE any ledger rows.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS goal_weight_lb numeric,
  ADD COLUMN IF NOT EXISTS goal_rate_lb_week numeric NOT NULL DEFAULT -0.5,
  ADD COLUMN IF NOT EXISTS goal_mode text NOT NULL DEFAULT 'recomp',
  ADD COLUMN IF NOT EXISTS gemini_api_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_goal_mode_check'
      AND conrelid = 'public.settings'::regclass
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_goal_mode_check
      CHECK (goal_mode IN ('cut', 'recomp', 'bulk'));
  END IF;
END $$;

ALTER TABLE public.measurements
  ADD COLUMN IF NOT EXISTS arm numeric,
  ADD COLUMN IF NOT EXISTS thigh numeric,
  ADD COLUMN IF NOT EXISTS hip numeric,
  ADD COLUMN IF NOT EXISTS neck numeric;

-- Extend import/reset RPCs for new columns without recreating tables.
CREATE OR REPLACE FUNCTION public.import_ledger_state(p_state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_data jsonb := COALESCE(p_state->'targets', '{}'::jsonb);
  goals_data jsonb := COALESCE(p_state->'goals', '{}'::jsonb);
BEGIN
  IF EXISTS (SELECT 1 FROM public.daily_logs)
    OR EXISTS (SELECT 1 FROM public.measurements)
    OR EXISTS (SELECT 1 FROM public.workouts)
    OR EXISTS (SELECT 1 FROM public.adjustments) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cloud already has data. Export/reset before importing.',
      ERRCODE = 'P0001';
  END IF;

  UPDATE public.settings
  SET
    calories_target = COALESCE((target_data->>'calories')::integer, 2600),
    protein_target = COALESCE((target_data->>'protein')::integer, 200),
    height_in = COALESCE((p_state->>'heightIn')::numeric, 75),
    goal_weight_lb = NULLIF(goals_data->>'weightLb', '')::numeric,
    goal_rate_lb_week = COALESCE((goals_data->>'rateLbWeek')::numeric, -0.5),
    goal_mode = COALESCE(NULLIF(goals_data->>'mode', ''), 'recomp'),
    updated_at = now()
  WHERE id = 1;

  INSERT INTO public.daily_logs (date, weight, calories, protein, carbs, fat)
  SELECT date, weight, calories, protein, carbs, fat
  FROM jsonb_to_recordset(COALESCE(p_state->'dailyLogs', '[]'::jsonb))
    AS row(date date, weight numeric, calories numeric, protein numeric, carbs numeric, fat numeric);

  INSERT INTO public.measurements (date, shoulder, waist, chest, arm, thigh, hip, neck, notes)
  SELECT date, shoulder, waist, chest, arm, thigh, hip, neck, COALESCE(notes, '')
  FROM jsonb_to_recordset(COALESCE(p_state->'measurements', '[]'::jsonb))
    AS row(
      date date,
      shoulder numeric,
      waist numeric,
      chest numeric,
      arm numeric,
      thigh numeric,
      hip numeric,
      neck numeric,
      notes text
    );

  INSERT INTO public.workouts (id, date, split, exercise, weight, sets, reps, notes)
  SELECT
    CASE
      WHEN id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN id::uuid
      ELSE gen_random_uuid()
    END,
    date,
    split,
    COALESCE(exercise, ''),
    weight,
    sets,
    reps,
    COALESCE(notes, '')
  FROM jsonb_to_recordset(COALESCE(p_state->'workouts', '[]'::jsonb))
    AS row(id text, date date, split text, exercise text, weight numeric, sets integer, reps integer, notes text);

  INSERT INTO public.adjustments (date, calories, reason)
  SELECT date, calories, COALESCE(reason, '')
  FROM jsonb_to_recordset(COALESCE(p_state->'adjustments', '[]'::jsonb))
    AS row(date date, calories integer, reason text);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.daily_logs;
  DELETE FROM public.measurements;
  DELETE FROM public.workouts;
  DELETE FROM public.adjustments;
  UPDATE public.settings
  SET calories_target = 2600,
      protein_target = 200,
      height_in = 75,
      goal_weight_lb = NULL,
      goal_rate_lb_week = -0.5,
      goal_mode = 'recomp',
      -- Preserve Gemini key across intentional resets of log data.
      updated_at = now()
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.import_ledger_state(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_ledger_state(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_ledger() TO service_role;
