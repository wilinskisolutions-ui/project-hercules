import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ledger-passphrase",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_TARGETS = { calories: 2600, protein: 200 };
const DEFAULT_HEIGHT = 75;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed.default || Object.values(parsed)[0];
    } catch {
      /* fall through */
    }
  }
  throw new Error("Service role key not configured");
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function expectedPassphrase(supabase: SupabaseClient): Promise<string | null> {
  const fromEnv = Deno.env.get("LEDGER_PASSPHRASE");
  if (fromEnv) return fromEnv;
  const { data, error } = await supabase
    .from("settings")
    .select("passphrase")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("passphrase lookup failed", error);
    return null;
  }
  return data?.passphrase ?? null;
}

async function checkPassphrase(req: Request, supabase: SupabaseClient) {
  const expected = await expectedPassphrase(supabase);
  if (!expected) {
    return json(500, { error: "LEDGER_PASSPHRASE is not configured" });
  }
  const provided = req.headers.get("X-Ledger-Passphrase") || "";
  if (provided !== expected) {
    return json(401, { error: "Unauthorized" });
  }
  return null;
}

function mapDaily(row: Record<string, unknown>) {
  return {
    date: row.date,
    weight: Number(row.weight),
    calories: row.calories == null ? null : Number(row.calories),
    protein: row.protein == null ? null : Number(row.protein),
    carbs: row.carbs == null ? null : Number(row.carbs),
    fat: row.fat == null ? null : Number(row.fat),
  };
}

function mapMeasurement(row: Record<string, unknown>) {
  return {
    date: row.date,
    shoulder: Number(row.shoulder),
    waist: Number(row.waist),
    chest: Number(row.chest),
    notes: (row.notes as string) || "",
  };
}

function mapWorkout(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    split: row.split,
    exercise: (row.exercise as string) || "",
    weight: row.weight == null ? null : Number(row.weight),
    sets: row.sets == null ? null : Number(row.sets),
    reps: row.reps == null ? null : Number(row.reps),
    notes: (row.notes as string) || "",
  };
}

function mapAdjustment(row: Record<string, unknown>) {
  return {
    date: row.date,
    calories: Number(row.calories),
    reason: row.reason,
  };
}

async function bootstrap(supabase: SupabaseClient) {
  const [settingsRes, dailyRes, measRes, workoutRes, adjRes] = await Promise.all([
    supabase
      .from("settings")
      .select("calories_target, protein_target, height_in")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("daily_logs").select("*").order("date", { ascending: true }),
    supabase.from("measurements").select("*").order("date", { ascending: true }),
    supabase.from("workouts").select("*").order("date", { ascending: true }),
    supabase.from("adjustments").select("*").order("date", { ascending: true }),
  ]);

  for (const res of [settingsRes, dailyRes, measRes, workoutRes, adjRes]) {
    if (res.error) throw res.error;
  }

  const settings = settingsRes.data;
  const dailyLogs = (dailyRes.data || []).map(mapDaily);
  const empty =
    dailyLogs.length === 0 &&
    (measRes.data || []).length === 0 &&
    (workoutRes.data || []).length === 0;

  return {
    dailyLogs,
    measurements: (measRes.data || []).map(mapMeasurement),
    workouts: (workoutRes.data || []).map(mapWorkout),
    targets: {
      calories: settings?.calories_target ?? DEFAULT_TARGETS.calories,
      protein: settings?.protein_target ?? DEFAULT_TARGETS.protein,
    },
    heightIn: settings?.height_in != null ? Number(settings.height_in) : DEFAULT_HEIGHT,
    adjustments: (adjRes.data || []).map(mapAdjustment),
    empty,
  };
}

async function upsertDaily(supabase: SupabaseClient, row: Record<string, unknown>) {
  const payload = {
    date: row.date,
    weight: row.weight,
    calories: row.calories ?? null,
    protein: row.protein ?? null,
    carbs: row.carbs ?? null,
    fat: row.fat ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("daily_logs").upsert(payload, { onConflict: "date" });
  if (error) throw error;
}

async function upsertMeasurement(supabase: SupabaseClient, row: Record<string, unknown>) {
  const payload = {
    date: row.date,
    shoulder: row.shoulder,
    waist: row.waist,
    chest: row.chest,
    notes: row.notes || "",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("measurements").upsert(payload, { onConflict: "date" });
  if (error) throw error;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function upsertWorkout(supabase: SupabaseClient, row: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    date: row.date,
    split: row.split,
    exercise: row.exercise || "",
    weight: row.weight ?? null,
    sets: row.sets ?? null,
    reps: row.reps ?? null,
    notes: row.notes || "",
    updated_at: new Date().toISOString(),
  };
  // Legacy local IDs like "w-123" are not valid Postgres uuids — omit so DB generates one.
  if (isUuid(row.id)) payload.id = row.id;
  const { data, error } = await supabase.from("workouts").upsert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function updateSettings(supabase: SupabaseClient, body: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.calories != null) patch.calories_target = body.calories;
  if (body.protein != null) patch.protein_target = body.protein;
  if (body.heightIn != null) patch.height_in = body.heightIn;
  if (body.targets && typeof body.targets === "object") {
    const t = body.targets as Record<string, unknown>;
    if (t.calories != null) patch.calories_target = t.calories;
    if (t.protein != null) patch.protein_target = t.protein;
  }
  const { error } = await supabase.from("settings").update(patch).eq("id", 1);
  if (error) throw error;
}

async function applyAdjustment(supabase: SupabaseClient, body: Record<string, unknown>) {
  const calories = Number(body.calories);
  const reason = String(body.reason || "Manual adjustment");
  const date = (body.date as string) || new Date().toISOString().slice(0, 10);
  const { error: sErr } = await supabase
    .from("settings")
    .update({ calories_target: calories, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (sErr) throw sErr;
  const { error: aErr } = await supabase.from("adjustments").insert({ date, calories, reason });
  if (aErr) throw aErr;
}

async function importState(supabase: SupabaseClient, state: Record<string, unknown>) {
  const current = await bootstrap(supabase);
  if (!current.empty) {
    return json(409, { error: "Cloud already has data. Export/reset before importing." });
  }

  const targets = (state.targets as Record<string, unknown>) || {};
  await updateSettings(supabase, {
    calories: targets.calories ?? DEFAULT_TARGETS.calories,
    protein: targets.protein ?? DEFAULT_TARGETS.protein,
    heightIn: state.heightIn ?? DEFAULT_HEIGHT,
  });

  for (const row of (state.dailyLogs as Record<string, unknown>[]) || []) {
    await upsertDaily(supabase, row);
  }
  for (const row of (state.measurements as Record<string, unknown>[]) || []) {
    await upsertMeasurement(supabase, row);
  }
  for (const row of (state.workouts as Record<string, unknown>[]) || []) {
    await upsertWorkout(supabase, row);
  }
  for (const row of (state.adjustments as Record<string, unknown>[]) || []) {
    const { error } = await supabase.from("adjustments").insert({
      date: row.date,
      calories: row.calories,
      reason: row.reason || "",
    });
    if (error) throw error;
  }

  return json(200, await bootstrap(supabase));
}

async function resetAll(supabase: SupabaseClient) {
  const ops = await Promise.all([
    supabase.from("daily_logs").delete().neq("date", "1900-01-01"),
    supabase.from("measurements").delete().neq("date", "1900-01-01"),
    supabase.from("workouts").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    supabase.from("adjustments").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    supabase
      .from("settings")
      .update({
        calories_target: DEFAULT_TARGETS.calories,
        protein_target: DEFAULT_TARGETS.protein,
        height_in: DEFAULT_HEIGHT,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1),
  ]);
  for (const op of ops) {
    if (op.error) throw op.error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  let supabase: SupabaseClient;
  try {
    supabase = adminClient();
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }

  const authError = await checkPassphrase(req, supabase);
  if (authError) return authError;

  try {
    if (req.method === "GET") {
      return json(200, await bootstrap(supabase));
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = await req.json();
    const op = body.op as string;

    switch (op) {
      case "bootstrap":
        return json(200, await bootstrap(supabase));
      case "upsert_daily":
        await upsertDaily(supabase, body.row || body);
        return json(200, { ok: true });
      case "delete_daily": {
        const { error } = await supabase.from("daily_logs").delete().eq("date", body.date);
        if (error) throw error;
        return json(200, { ok: true });
      }
      case "upsert_measurement":
        await upsertMeasurement(supabase, body.row || body);
        return json(200, { ok: true });
      case "delete_measurement": {
        const { error } = await supabase.from("measurements").delete().eq("date", body.date);
        if (error) throw error;
        return json(200, { ok: true });
      }
      case "upsert_workout": {
        const id = await upsertWorkout(supabase, body.row || body);
        return json(200, { ok: true, id });
      }
      case "delete_workout": {
        if (!isUuid(body.id)) return json(200, { ok: true, skipped: true });
        const { error } = await supabase.from("workouts").delete().eq("id", body.id);
        if (error) throw error;
        return json(200, { ok: true });
      }
      case "update_settings":
        await updateSettings(supabase, body);
        return json(200, { ok: true });
      case "apply_adjustment":
        await applyAdjustment(supabase, body);
        return json(200, { ok: true });
      case "import_state":
        return await importState(supabase, body.state || body);
      case "reset":
        await resetAll(supabase);
        return json(200, await bootstrap(supabase));
      default:
        return json(400, { error: "Unknown op: " + op });
    }
  } catch (e) {
    console.error(e);
    return json(500, { error: (e as Error).message || "Server error" });
  }
});
