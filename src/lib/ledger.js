export const DEFAULT_TARGETS = { calories: 2600, protein: 200 }
export const DEFAULT_HEIGHT = 75
export const EMPTY_LEDGER = {
  dailyLogs: [],
  measurements: [],
  workouts: [],
  targets: DEFAULT_TARGETS,
  adjustments: [],
  heightIn: DEFAULT_HEIGHT,
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

export function normalizeLedger(payload = {}) {
  return {
    dailyLogs: payload.dailyLogs || [],
    measurements: payload.measurements || [],
    workouts: payload.workouts || [],
    targets: { ...DEFAULT_TARGETS, ...(payload.targets || {}) },
    adjustments: payload.adjustments || [],
    heightIn: Number(payload.heightIn || DEFAULT_HEIGHT),
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

export function computeTrend(logs) {
  const series = rollingSeries(logs)
  if (series.length < 4 || daysBetween(series[0].date, series.at(-1).date) < 10) {
    return { status: 'logging', rate: null }
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
  if (gap < 3) return { status: 'logging', rate: null }
  const rate = (latest.aww - closest.aww) / (gap / 7)
  const status =
    rate <= -1
      ? 'too_fast'
      : rate <= -0.4
        ? 'on_track'
        : rate < 0.15
          ? series.length >= 10
            ? 'plateau'
            : 'on_track'
          : 'gaining'
  return { status, rate, latestAWW: latest.aww }
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
      shoulderDelta: previous ? item.shoulder - previous.shoulder : null,
      waistDelta: previous ? item.waist - previous.waist : null,
      chestDelta: previous ? item.chest - previous.chest : null,
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

  const trend = computeTrend(ledger.dailyLogs)
  if (trend.status === 'too_fast' || trend.status === 'gaining' || trend.status === 'plateau') {
    insights.push({
      tone: trend.status === 'plateau' ? 'warn' : 'bad',
      label: 'Weight trend',
      text:
        trend.status === 'too_fast'
          ? `AWW is dropping too fast (${trend.rate.toFixed(2)} lb/week).`
          : trend.status === 'gaining'
            ? `AWW is rising (${trend.rate.toFixed(2)} lb/week).`
            : 'AWW has plateaued across multiple weeks.',
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

