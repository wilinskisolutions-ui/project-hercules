-- Apply the target update and audit entry in one Postgres transaction.
-- SECURITY INVOKER means the Edge Function's service-role permissions apply.
CREATE OR REPLACE FUNCTION public.apply_calorie_adjustment(
  p_calories integer,
  p_reason text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_calories < 500 OR p_calories > 10000 THEN
    RAISE EXCEPTION 'calories out of range';
  END IF;

  UPDATE public.settings
  SET calories_target = p_calories, updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settings row missing';
  END IF;

  INSERT INTO public.adjustments (date, calories, reason)
  VALUES (p_date, p_calories, COALESCE(NULLIF(trim(p_reason), ''), 'Manual adjustment'));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_calorie_adjustment(integer, text, date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_calorie_adjustment(integer, text, date)
TO service_role;

