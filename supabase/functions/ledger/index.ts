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
const DEFAULT_GOAL_RATE = -0.5;
const DEFAULT_GOAL_MODE = "recomp";
const GOAL_MODES = new Set(["cut", "recomp", "bulk"]);
const GEMINI_MODEL = "gemini-3.6-flash";
const TREND_DEADBAND = 0.2;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function requiredString(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`);
  }
  if (value.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is too long`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, max = 2000): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
}

function validDate(value: unknown, field = "date"): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be YYYY-MM-DD`);
  }
  return value;
}

function numberValue(
  value: unknown,
  field: string,
  { optional = false, min = 0, max = 100_000 } = {},
): number | null {
  if (optional && (value == null || value === "")) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is invalid`);
  }
  return parsed;
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
    return json(500, {
      error: "LEDGER_PASSPHRASE is not configured",
      code: "AUTH_NOT_CONFIGURED",
    });
  }
  const provided = req.headers.get("X-Ledger-Passphrase") || "";
  if (provided !== expected) {
    return json(401, { error: "Unauthorized", code: "UNAUTHORIZED" });
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

function optionalMeasure(value: unknown) {
  return value == null ? null : Number(value);
}

function mapMeasurement(row: Record<string, unknown>) {
  return {
    date: row.date,
    shoulder: Number(row.shoulder),
    waist: Number(row.waist),
    chest: Number(row.chest),
    arm: optionalMeasure(row.arm),
    thigh: optionalMeasure(row.thigh),
    hip: optionalMeasure(row.hip),
    neck: optionalMeasure(row.neck),
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
    id: row.id,
    date: row.date,
    calories: Number(row.calories),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapGoals(settings: Record<string, unknown> | null) {
  const mode =
    typeof settings?.goal_mode === "string" && GOAL_MODES.has(settings.goal_mode)
      ? settings.goal_mode
      : DEFAULT_GOAL_MODE;
  return {
    weightLb: settings?.goal_weight_lb == null ? null : Number(settings.goal_weight_lb),
    rateLbWeek:
      settings?.goal_rate_lb_week == null
        ? DEFAULT_GOAL_RATE
        : Number(settings.goal_rate_lb_week),
    mode,
  };
}

async function bootstrap(supabase: SupabaseClient) {
  const [settingsRes, dailyRes, measRes, workoutRes, adjRes] = await Promise.all([
    supabase
      .from("settings")
      .select(
        "calories_target, protein_target, height_in, goal_weight_lb, goal_rate_lb_week, goal_mode, gemini_api_key",
      )
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
    (workoutRes.data || []).length === 0 &&
    (adjRes.data || []).length === 0;

  return {
    dailyLogs,
    measurements: (measRes.data || []).map(mapMeasurement),
    workouts: (workoutRes.data || []).map(mapWorkout),
    targets: {
      calories: settings?.calories_target ?? DEFAULT_TARGETS.calories,
      protein: settings?.protein_target ?? DEFAULT_TARGETS.protein,
    },
    heightIn: settings?.height_in != null ? Number(settings.height_in) : DEFAULT_HEIGHT,
    goals: mapGoals(settings),
    hasGeminiKey: Boolean(settings?.gemini_api_key),
    adjustments: (adjRes.data || []).map(mapAdjustment),
    empty,
  };
}

async function upsertDaily(supabase: SupabaseClient, row: Record<string, unknown>) {
  const payload = {
    date: validDate(row.date),
    weight: numberValue(row.weight, "weight", { min: 40, max: 1_000 }),
    calories: numberValue(row.calories, "calories", { optional: true }),
    protein: numberValue(row.protein, "protein", { optional: true, max: 1_000 }),
    carbs: numberValue(row.carbs, "carbs", { optional: true, max: 2_000 }),
    fat: numberValue(row.fat, "fat", { optional: true, max: 1_000 }),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("daily_logs").upsert(payload, { onConflict: "date" });
  if (error) throw error;
}

async function upsertMeasurement(supabase: SupabaseClient, row: Record<string, unknown>) {
  const payload = {
    date: validDate(row.date),
    shoulder: numberValue(row.shoulder, "shoulder", { min: 1, max: 200 }),
    waist: numberValue(row.waist, "waist", { min: 1, max: 200 }),
    chest: numberValue(row.chest, "chest", { min: 1, max: 200 }),
    arm: numberValue(row.arm, "arm", { optional: true, min: 1, max: 200 }),
    thigh: numberValue(row.thigh, "thigh", { optional: true, min: 1, max: 200 }),
    hip: numberValue(row.hip, "hip", { optional: true, min: 1, max: 200 }),
    neck: numberValue(row.neck, "neck", { optional: true, min: 1, max: 200 }),
    notes: optionalString(row.notes, "notes"),
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
    date: validDate(row.date),
    split: requiredString(row.split, "split", 120),
    exercise: optionalString(row.exercise, "exercise", 200),
    weight: numberValue(row.weight, "weight", { optional: true, max: 5_000 }),
    sets: numberValue(row.sets, "sets", { optional: true, max: 100 }),
    reps: numberValue(row.reps, "reps", { optional: true, max: 10_000 }),
    notes: optionalString(row.notes, "notes"),
    updated_at: new Date().toISOString(),
  };
  if (isUuid(row.id)) payload.id = row.id;
  const { data, error } = await supabase
    .from("workouts")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function updateSettings(supabase: SupabaseClient, body: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let caloriesTarget: number | null = null;
  if (body.calories != null) {
    caloriesTarget = numberValue(body.calories, "calories", { min: 500, max: 10_000 });
  }
  if (body.protein != null) {
    patch.protein_target = numberValue(body.protein, "protein", { min: 0, max: 1_000 });
  }
  if (body.heightIn != null) {
    patch.height_in = numberValue(body.heightIn, "heightIn", { min: 24, max: 120 });
  }
  if (body.goalWeightLb !== undefined) {
    patch.goal_weight_lb = numberValue(body.goalWeightLb, "goalWeightLb", {
      optional: true,
      min: 40,
      max: 1_000,
    });
  }
  if (body.goalRateLbWeek != null) {
    patch.goal_rate_lb_week = numberValue(body.goalRateLbWeek, "goalRateLbWeek", {
      min: -5,
      max: 5,
    });
  }
  if (body.goalMode != null) {
    const mode = requiredString(body.goalMode, "goalMode", 20);
    if (!GOAL_MODES.has(mode)) {
      throw new ApiError(400, "VALIDATION_ERROR", "goalMode must be cut, recomp, or bulk");
    }
    patch.goal_mode = mode;
  }
  if (body.clearGeminiKey === true) {
    patch.gemini_api_key = null;
  } else if (body.geminiApiKey != null) {
    const key = requiredString(body.geminiApiKey, "geminiApiKey", 200);
    patch.gemini_api_key = key;
  }
  if (body.targets && typeof body.targets === "object") {
    const t = body.targets as Record<string, unknown>;
    if (t.calories != null) {
      caloriesTarget = numberValue(t.calories, "calories", { min: 500, max: 10_000 });
    }
    if (t.protein != null) {
      patch.protein_target = numberValue(t.protein, "protein", { min: 0, max: 1_000 });
    }
  }
  if (Object.keys(patch).length === 1 && caloriesTarget == null) {
    throw new ApiError(400, "VALIDATION_ERROR", "No settings supplied");
  }

  if (caloriesTarget != null) {
    const { data: current, error: readError } = await supabase
      .from("settings")
      .select("calories_target")
      .eq("id", 1)
      .single();
    if (readError) throw readError;
    if (Number(current.calories_target) !== caloriesTarget) {
      await applyAdjustment(supabase, {
        calories: caloriesTarget,
        reason: "Manual target update",
      });
    }
  }

  if (Object.keys(patch).length > 1) {
    const { error } = await supabase
      .from("settings")
      .update(patch)
      .eq("id", 1)
      .select("id")
      .single();
    if (error) throw error;
  }
}

async function applyAdjustment(supabase: SupabaseClient, body: Record<string, unknown>) {
  const calories = numberValue(body.calories, "calories", { min: 500, max: 10_000 });
  const reason = optionalString(body.reason, "reason", 500) || "Manual adjustment";
  const date = body.date == null
    ? new Date().toISOString().slice(0, 10)
    : validDate(body.date);
  const { error } = await supabase.rpc("apply_calorie_adjustment", {
    p_calories: calories,
    p_reason: reason,
    p_date: date,
  });
  if (error) throw error;
}

async function importState(supabase: SupabaseClient, state: Record<string, unknown>) {
  const { error } = await supabase.rpc("import_ledger_state", { p_state: state });
  if (error) {
    if (error.code === "P0001") {
      throw new ApiError(409, "IMPORT_CONFLICT", error.message);
    }
    throw error;
  }
  return json(200, await bootstrap(supabase));
}

async function resetAll(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("reset_ledger");
  if (error) throw error;
}

function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysISO(iso: string, amount: number) {
  const date = localDate(iso);
  date.setDate(date.getDate() + amount);
  return todayISO(date);
}

function daysBetween(from: string, to: string) {
  return Math.round((localDate(to).getTime() - localDate(from).getTime()) / 86_400_000);
}

function sortByDate<T extends { date: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRecent(
  logs: Array<Record<string, unknown>>,
  field: string,
  days = 7,
) {
  const withValue = sortByDate(
    logs.filter((item) => item[field] != null) as Array<{ date: string } & Record<string, unknown>>,
  );
  if (!withValue.length) return null;
  const start = addDaysISO(withValue.at(-1)!.date, -(days - 1));
  const window = withValue.filter((item) => item.date >= start);
  return average(window.map((item) => Number(item[field])));
}

function rollingSeries(logs: Array<{ date: string; weight: number }>) {
  const sorted = sortByDate(logs);
  return sorted.map((entry) => {
    const start = addDaysISO(entry.date, -6);
    const window = sorted.filter((item) => item.date >= start && item.date <= entry.date);
    const aww = window.reduce((sum, item) => sum + Number(item.weight), 0) / window.length;
    return { ...entry, aww };
  });
}

function computeTrend(
  logs: Array<{ date: string; weight: number }>,
  goalRate = DEFAULT_GOAL_RATE,
) {
  const series = rollingSeries(logs);
  if (series.length < 4 || daysBetween(series[0].date, series.at(-1)!.date) < 10) {
    return { status: "logging", rate: null as number | null, goalRate, latestAWW: null as number | null, error: null as number | null };
  }
  const latest = series.at(-1)!;
  const targetDate = addDaysISO(latest.date, -7);
  let closest = series[0];
  let best = Infinity;
  for (const point of series) {
    const difference = Math.abs(daysBetween(point.date, targetDate));
    if (difference < best) {
      best = difference;
      closest = point;
    }
  }
  const gap = daysBetween(closest.date, latest.date);
  if (gap < 3) {
    return { status: "logging", rate: null, goalRate, latestAWW: null, error: null };
  }
  const rate = (latest.aww - closest.aww) / (gap / 7);
  const goal = Number(goalRate);
  const error = rate - goal;
  let status = "on_track";
  if (Math.abs(error) <= TREND_DEADBAND) {
    status = "on_track";
  } else if (goal === 0) {
    status = Math.abs(rate) > TREND_DEADBAND ? "wrong_direction" : "on_track";
  } else if (Math.sign(rate) !== 0 && Math.sign(goal) !== 0 && Math.sign(rate) !== Math.sign(goal)) {
    status = "wrong_direction";
  } else if (Math.abs(rate) > Math.abs(goal) + TREND_DEADBAND) {
    status = "too_fast";
  } else {
    status = "too_slow";
  }
  return { status, rate, goalRate: goal, latestAWW: latest.aww, error };
}

function summarizeForAi(payload: Awaited<ReturnType<typeof bootstrap>>) {
  const asOf = todayISO();
  const allLogs = sortByDate(
    payload.dailyLogs.map((row) => ({
      date: String(row.date),
      weight: Number(row.weight),
      calories: row.calories == null ? null : Number(row.calories),
      protein: row.protein == null ? null : Number(row.protein),
    })),
  );
  const logs = allLogs.slice(-28);
  const measurements = sortByDate(payload.measurements).slice(-8);
  const workouts = sortByDate(payload.workouts).slice(-14);
  const adjustments = sortByDate(payload.adjustments).slice(-8);
  const goalRate = payload.goals?.rateLbWeek ?? DEFAULT_GOAL_RATE;
  const trend = computeTrend(allLogs, goalRate);

  const avgCalories7 = averageRecent(logs, "calories", 7);
  const avgCalories28 = averageRecent(logs, "calories", 28);
  const avgProtein7 = averageRecent(logs, "protein", 7);
  const avgProtein28 = averageRecent(logs, "protein", 28);
  const calorieTarget = payload.targets.calories;
  const proteinTarget = payload.targets.protein;

  const loggedDates = new Set(allLogs.map((row) => row.date));
  const missedLast14 = Array.from({ length: 14 }, (_, index) => addDaysISO(asOf, -index)).filter(
    (day) => !loggedDates.has(day),
  ).length;

  const firstMeas = measurements[0];
  const lastMeas = measurements.at(-1);
  const measurementDeltas =
    firstMeas && lastMeas && firstMeas.date !== lastMeas.date
      ? {
          from: firstMeas.date,
          to: lastMeas.date,
          waist: lastMeas.waist - firstMeas.waist,
          shoulder: lastMeas.shoulder - firstMeas.shoulder,
          chest: lastMeas.chest - firstMeas.chest,
          arm:
            lastMeas.arm != null && firstMeas.arm != null
              ? lastMeas.arm - firstMeas.arm
              : null,
          thigh:
            lastMeas.thigh != null && firstMeas.thigh != null
              ? lastMeas.thigh - firstMeas.thigh
              : null,
        }
      : null;

  const workoutsLast7 = payload.workouts.filter(
    (row) => String(row.date) >= addDaysISO(asOf, -7),
  ).length;
  const workoutsLast14 = payload.workouts.filter(
    (row) => String(row.date) >= addDaysISO(asOf, -14),
  ).length;

  const pct = (value: number | null, target: number) =>
    value == null || !target ? null : Math.round((value / target) * 100);

  return {
    asOf,
    goals: payload.goals,
    targets: payload.targets,
    heightIn: payload.heightIn,
    trend: {
      status: trend.status,
      awwRateLbWeek: trend.rate == null ? null : Number(trend.rate.toFixed(2)),
      goalRateLbWeek: Number(goalRate),
      errorVsGoalLbWeek: trend.error == null ? null : Number(trend.error.toFixed(2)),
      latestAwwLb: trend.latestAWW == null ? null : Number(trend.latestAWW.toFixed(1)),
    },
    adherence: {
      avgCalories7,
      avgCalories28,
      avgProtein7,
      avgProtein28,
      calorieAdherence7Pct: pct(avgCalories7, calorieTarget),
      proteinAdherence7Pct: pct(avgProtein7, proteinTarget),
      missedWeighInsLast14: missedLast14,
      workoutsLast7,
      workoutsLast14,
    },
    measurementDeltas,
    recentDailyLogs: logs.slice(-14),
    recentMeasurements: measurements,
    recentWorkouts: workouts.map((row) => ({
      date: row.date,
      split: row.split,
      exercise: row.exercise,
      weight: row.weight,
      sets: row.sets,
      reps: row.reps,
    })),
    recentAdjustments: adjustments.map((row) => ({
      date: row.date,
      calories: row.calories,
      reason: row.reason,
    })),
    counts: {
      weighIns: payload.dailyLogs.length,
      measurementCheckIns: payload.measurements.length,
      workouts: payload.workouts.length,
    },
  };
}

const COACH_SYSTEM_INSTRUCTION =
  "You are a recomp physique coach reading a private ledger. " +
  "Use ONLY the provided JSON evidence. Do not invent numbers. " +
  "Your job is to find patterns, compare the weight trend to the user's goal rate, " +
  "and give concrete ways to stay on track. " +
  "Cite AWW rate vs goal rate in lb/week, calorie/protein averages vs targets, " +
  "logging consistency, training frequency, and tape deltas when present. " +
  "No medical claims. No markdown, no asterisks, no bullet symbols other than dashes. " +
  "Keep the whole answer under 280 words. " +
  "Always reply in exactly this plain-text format:\n" +
  "VERDICT: <on track | too fast | too slow | wrong direction | need more data>\n" +
  "TREND: <1-2 sentences with AWW rate vs goal rate>\n" +
  "PATTERNS: <3-5 short lines starting with '- ' covering calories, protein, logging, training, measurements>\n" +
  "STAY ON TRACK: <2-4 short lines starting with '- ' with concrete numbered actions>\n" +
  "NEXT 7 DAYS: <one short focus line>\n" +
  "If trend.status is logging or evidence is thin, VERDICT must be need more data and say exactly what to log.";

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: GeminiPart[] };
  }>;
  error?: { message?: string };
};

function extractAdviceText(raw: GeminiResponse | null) {
  const parts = raw?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function callGemini(
  apiKey: string,
  summary: ReturnType<typeof summarizeForAi>,
  {
    thinkingLevel,
    maxOutputTokens,
  }: { thinkingLevel: "minimal" | "low"; maxOutputTokens: number },
) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: COACH_SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Coach from this precomputed ledger evidence. " +
                  "Compare trend.awwRateLbWeek to trend.goalRateLbWeek. " +
                  "Use adherence and measurementDeltas to spot patterns. " +
                  "Give actions that keep the user on their goal.\n" +
                  JSON.stringify(summary),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens,
          thinkingConfig: { thinkingLevel },
        },
      }),
    });
  } catch (cause) {
    console.error("gemini network error", cause);
    throw new ApiError(502, "GEMINI_NETWORK", "Could not reach Gemini.");
  }

  const raw = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok) {
    const message = raw?.error?.message || `Gemini request failed (${response.status})`;
    throw new ApiError(502, "GEMINI_ERROR", message);
  }

  return {
    raw,
    advice: extractAdviceText(raw),
    finishReason: raw?.candidates?.[0]?.finishReason || "",
  };
}

async function analyzeWithGemini(supabase: SupabaseClient) {
  const { data: settings, error } = await supabase
    .from("settings")
    .select("gemini_api_key")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const apiKey = settings?.gemini_api_key?.trim();
  if (!apiKey) {
    throw new ApiError(
      400,
      "MISSING_GEMINI_KEY",
      "Add a Gemini API key in Targets before running analysis.",
    );
  }

  const payload = await bootstrap(supabase);
  const summary = summarizeForAi(payload);

  let result = await callGemini(apiKey, summary, {
    thinkingLevel: "low",
    maxOutputTokens: 2048,
  });

  if (!result.advice || result.finishReason === "MAX_TOKENS") {
    result = await callGemini(apiKey, summary, {
      thinkingLevel: "minimal",
      maxOutputTokens: 4096,
    });
  }

  if (!result.advice) {
    throw new ApiError(502, "GEMINI_EMPTY", "Gemini returned an empty response.");
  }
  if (result.finishReason === "MAX_TOKENS") {
    throw new ApiError(
      502,
      "GEMINI_TRUNCATED",
      "Gemini cut the coaching response short. Try Analyze again.",
    );
  }

  return {
    advice: result.advice,
    generatedAt: new Date().toISOString(),
    model: GEMINI_MODEL,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let supabase: SupabaseClient;
    try {
      supabase = adminClient();
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }

    const authError = await checkPassphrase(req, supabase);
    if (authError) return authError;

    if (req.method === "GET") {
      return json(200, await bootstrap(supabase));
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
    }
    const op = body.op as string;

    switch (op) {
      case "bootstrap":
        return json(200, await bootstrap(supabase));
      case "upsert_daily":
        await upsertDaily(supabase, body.row || body);
        return json(200, { ok: true });
      case "delete_daily": {
        const { error } = await supabase
          .from("daily_logs")
          .delete()
          .eq("date", validDate(body.date));
        if (error) throw error;
        return json(200, { ok: true });
      }
      case "upsert_measurement":
        await upsertMeasurement(supabase, body.row || body);
        return json(200, { ok: true });
      case "delete_measurement": {
        const { error } = await supabase
          .from("measurements")
          .delete()
          .eq("date", validDate(body.date));
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
      case "analyze":
        return json(200, await analyzeWithGemini(supabase));
      case "import_state":
        return await importState(supabase, body.state || body);
      case "reset":
        await resetAll(supabase);
        return json(200, await bootstrap(supabase));
      default:
        return json(400, {
          error: "Unknown operation",
          code: "UNKNOWN_OPERATION",
        });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ApiError) {
      return json(e.status, { error: e.message, code: e.code });
    }
    return json(500, {
      error: "Server error",
      code: "INTERNAL_ERROR",
    });
  }
});
