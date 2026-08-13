export const DEFAULT_TARGETS = { calories: 2600, protein: 200 }
export const DEFAULT_HEIGHT = 75
export const DEFAULT_GOALS = {
  weightLb: null,
  rateLbWeek: -0.5,
  mode: 'recomp',
}
export const GOAL_MODES = ['cut', 'recomp', 'bulk']
export const TREND_DEADBAND = 0.2
export const EMPTY_LEDGER = {
  dailyLogs: [],
  measurements: [],
  workouts: [],
  targets: DEFAULT_TARGETS,
  adjustments: [],
  heightIn: DEFAULT_HEIGHT,
  goals: { ...DEFAULT_GOALS },
  hasGeminiKey: false,
}

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDaysISO(iso, amount) {
  const date = localDate(iso)
  date.setDate(date.getDate() + amount)
  return todayISO(date)
}

export function daysBetween(from, to) {
  return Math.round((localDate(to) - localDate(from)) / 86_400_000)
}

export function sortByDate(rows) {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date))
}

export function normalizeGoals(goals = {}) {
  const mode = GOAL_MODES.includes(goals.mode) ? goals.mode : DEFAULT_GOALS.mode
  const rate =
    goals.rateLbWeek == null || goals.rateLbWeek === ''
      ? DEFAULT_GOALS.rateLbWeek
      : Number(goals.rateLbWeek)
  const weight =
    goals.weightLb == null || goals.weightLb === '' ? null : Number(goals.weightLb)
  return {
    weightLb: Number.isFinite(weight) ? weight : null,
    rateLbWeek: Number.isFinite(rate) ? rate : DEFAULT_GOALS.rateLbWeek,
    mode,
  }
}

export function normalizeLedger(payload = {}) {
  return {
    dailyLogs: payload.dailyLogs || [],
    measurements: payload.measurements || [],
    workouts: payload.workouts || [],
    targets: { ...DEFAULT_TARGETS, ...(payload.targets || {}) },
    adjustments: payload.adjustments || [],
    heightIn: Number(payload.heightIn || DEFAULT_HEIGHT),
    goals: normalizeGoals(payload.goals),
    hasGeminiKey: Boolean(payload.hasGeminiKey),
    empty: Boolean(payload.empty),
  }
}

export function rollingSeries(logs) {
  const sorted = sortByDate(logs)
  return sorted.map((entry) => {
    const start = addDaysISO(entry.date, -6)
    const window = sorted.filter((item) => item.date >= start && item.date <= entry.date)
    const aww = window.reduce((sum, item) => sum + Number(item.weight), 0) / window.length
    return { ...entry, aww }
  })
}

/**
 * Compare observed AWW rate to the user's goal rate (± deadband).
 * status: logging | on_track | too_fast | too_slow | wrong_direction
 */
export function computeTrend(logs, goalRate = DEFAULT_GOALS.rateLbWeek) {
  const series = rollingSeries(logs)
  if (series.length < 4 || daysBetween(series[0].date, series.at(-1).date) < 10) {
    return { status: 'logging', rate: null, goalRate, latestAWW: null }
  }
  const latest = series.at(-1)
  const targetDate = addDaysISO(latest.date, -7)
  let closest = series[0]
  let best = Infinity
  for (const point of series) {
    const difference = Math.abs(daysBetween(point.date, targetDate))
    if (difference < best) {
      best = difference
      closest = point
    }
  }
  const gap = daysBetween(closest.date, latest.date)
  if (gap < 3) return { status: 'logging', rate: null, goalRate, latestAWW: null }
  const rate = (latest.aww - closest.aww) / (gap / 7)
  const goal = Number(goalRate)
  const error = rate - goal
  let status = 'on_track'
  if (Math.abs(error) <= TREND_DEADBAND) {
    status = 'on_track'
  } else if (goal === 0) {
    status = Math.abs(rate) > TREND_DEADBAND ? 'wrong_direction' : 'on_track'
  } else if (Math.sign(rate) !== 0 && Math.sign(goal) !== 0 && Math.sign(rate) !== Math.sign(goal)) {
    status = 'wrong_direction'
  } else if (Math.abs(rate) > Math.abs(goal) + TREND_DEADBAND) {
    status = 'too_fast'
  } else {
    status = 'too_slow'
  }
  return { status, rate, goalRate: goal, latestAWW: latest.aww, error }
}

/** Suggested calorie target from AWW vs goal. Null when no change advised. */
export function suggestCalories(currentCalories, trend) {
  if (trend?.rate == null || trend.status === 'logging' || trend.status === 'on_track') {
    return null
  }
  const goal = Number(trend.goalRate)
  const error = trend.rate - goal
  // Positive error → losing slower / gaining more than desired → cut calories.
  // Negative error → losing faster / gaining less than desired → raise calories.
  const rawStep = Math.round((-error / 0.2) * 100)
  const clamped = Math.max(-200, Math.min(200, rawStep))
  const magnitude = Math.max(75, Math.min(200, Math.abs(clamped) || 100))
  const delta = clamped === 0 ? (error > 0 ? -100 : 100) : clamped > 0 ? magnitude : -magnitude
  const next = Math.round(Number(currentCalories) + delta)
  return Math.max(500, Math.min(10_000, next))
}

export function averageRecent(logs, field, days = 7) {
  const withValue = sortByDate(logs).filter((item) => item[field] != null)
  if (!withValue.length) return null
  const start = addDaysISO(withValue.at(-1).date, -(days - 1))
  const window = withValue.filter((item) => item.date >= start)
  return window.reduce((sum, item) => sum + Number(item[field]), 0) / window.length
}

export function measurementRows(measurements, heightIn = DEFAULT_HEIGHT) {
  return sortByDate(measurements).map((item, index, rows) => {
    const previous = rows[index - 1]
    return {
      ...item,
      shoulderWaist: item.shoulder && item.waist ? item.shoulder / item.waist : null,
      chestWaist: item.chest && item.waist ? item.chest / item.waist : null,
      waistHeight: item.waist ? item.waist / heightIn : null,
      waistHip: item.waist && item.hip ? item.waist / item.hip : null,
      shoulderDelta: previous ? item.shoulder - previous.shoulder : null,
      waistDelta: previous ? item.waist - previous.waist : null,
      chestDelta: previous ? item.chest - previous.chest : null,
      armDelta: previous && item.arm != null && previous.arm != null ? item.arm - previous.arm : null,
      thighDelta:
        previous && item.thigh != null && previous.thigh != null ? item.thigh - previous.thigh : null,
    }
  })
}

export function buildInsights(ledger, date = todayISO()) {
  const insights = []
  const dates = new Set(ledger.dailyLogs.map((item) => item.date))
  const missed = Array.from({ length: 14 }, (_, index) => addDaysISO(date, -index)).filter(
    (day) => !dates.has(day),
  )
  if (!dates.has(date)) {
    insights.push({ tone: 'warn', label: 'Log today', text: 'No weigh-in logged today.', tab: 'daily' })
  }
  if (missed.length >= 3) {
    insights.push({
      tone: 'warn',
      label: 'Consistency',
      text: `${missed.length} daily logs are missing in the last 14 days.`,
      tab: 'daily',
    })
  }

  const goalRate = ledger.goals?.rateLbWeek ?? DEFAULT_GOALS.rateLbWeek
  const trend = computeTrend(ledger.dailyLogs, goalRate)
  if (trend.status === 'too_fast' || trend.status === 'too_slow' || trend.status === 'wrong_direction') {
    const rateText = `${trend.rate.toFixed(2)} vs goal ${goalRate.toFixed(2)} lb/week`
    insights.push({
      tone: trend.status === 'too_slow' ? 'warn' : 'bad',
      label: 'Weight trend',
      text:
        trend.status === 'too_fast'
          ? `AWW is moving faster than your goal (${rateText}).`
          : trend.status === 'too_slow'
            ? `AWW is moving slower than your goal (${rateText}).`
            : `AWW is moving the wrong direction (${rateText}).`,
      tab: 'daily',
    })
  }

  const protein = averageRecent(ledger.dailyLogs, 'protein')
  if (protein != null && protein < ledger.targets.protein * 0.9) {
    insights.push({
      tone: 'warn',
      label: 'Protein',
      text: `7-day average is ${Math.round(protein)}g versus ${ledger.targets.protein}g target.`,
      tab: 'daily',
    })
  }

  if (!ledger.workouts.some((item) => item.date >= addDaysISO(date, -7))) {
    insights.push({ tone: 'warn', label: 'Training', text: 'No workout in the last 7 days.', tab: 'workout' })
  }

  const latestMeasurement = sortByDate(ledger.measurements).at(-1)
  if (!latestMeasurement || daysBetween(latestMeasurement.date, date) > 10) {
    insights.push({
      tone: 'info',
      label: 'Measurements',
      text: latestMeasurement ? 'Measurements are overdue.' : 'Add a baseline measurement.',
      tab: 'measurement',
    })
  }

  return insights.length
    ? insights
    : [{ tone: 'good', label: 'All clear', text: 'No coaching alerts right now.', tab: 'daily' }]
}

export function isLedgerEmpty(ledger) {
  return !ledger.dailyLogs.length && !ledger.measurements.length && !ledger.workouts.length
}
