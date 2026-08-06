CREATE OR REPLACE FUNCTION public.import_ledger_state(p_state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_data jsonb := COALESCE(p_state->'targets', '{}'::jsonb);
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
    updated_at = now()
  WHERE id = 1;

  INSERT INTO public.daily_logs (date, weight, calories, protein, carbs, fat)
  SELECT date, weight, calories, protein, carbs, fat
  FROM jsonb_to_recordset(COALESCE(p_state->'dailyLogs', '[]'::jsonb))
    AS row(date date, weight numeric, calories numeric, protein numeric, carbs numeric, fat numeric);

  INSERT INTO public.measurements (date, shoulder, waist, chest, notes)
  SELECT date, shoulder, waist, chest, COALESCE(notes, '')
  FROM jsonb_to_recordset(COALESCE(p_state->'measurements', '[]'::jsonb))
    AS row(date date, shoulder numeric, waist numeric, chest numeric, notes text);

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
      updated_at = now()
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.import_ledger_state(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_ledger_state(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_ledger() TO service_role;

