import { describe, expect, it } from 'vitest'
import {
  buildInsights,
  computeTrend,
  measurementRows,
  normalizeLedger,
  rollingSeries,
  suggestCalories,
} from './ledger'

function weekOfLogs(startWeight, dailyDelta = -0.15) {
  return Array.from({ length: 14 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    weight: startWeight + dailyDelta * index,
  }))
}

describe('ledger calculations', () => {
  it('normalizes missing collections and defaults', () => {
    expect(normalizeLedger({})).toMatchObject({
      dailyLogs: [],
      measurements: [],
      workouts: [],
      targets: { calories: 2600, protein: 200 },
      heightIn: 75,
      goals: { weightLb: null, rateLbWeek: -0.5, mode: 'recomp' },
      hasGeminiKey: false,
    })
  })

  it('calculates AWW from logged days in the trailing calendar week', () => {
    const series = rollingSeries([
      { date: '2026-08-01', weight: 200 },
      { date: '2026-08-04', weight: 198 },
      { date: '2026-08-08', weight: 196 },
    ])
    expect(series.map((point) => point.aww)).toEqual([200, 199, 197])
  })

  it('stays in logging mode until enough time has elapsed', () => {
    expect(
      computeTrend([
        { date: '2026-08-01', weight: 200 },
        { date: '2026-08-02', weight: 199.8 },
        { date: '2026-08-03', weight: 199.6 },
        { date: '2026-08-04', weight: 199.4 },
      ]),
    ).toMatchObject({ status: 'logging', rate: null })
  })

  it('marks on_track when AWW rate matches the goal band', () => {
    const trend = computeTrend(weekOfLogs(200, -0.08), -0.5)
    expect(trend.status).toBe('on_track')
    expect(trend.rate).toBeCloseTo(-0.56, 1)
  })

  it('flags too_fast when loss exceeds the goal deadband', () => {
    const trend = computeTrend(weekOfLogs(200, -0.25), -0.5)
    expect(trend.status).toBe('too_fast')
    expect(suggestCalories(2600, trend)).toBeGreaterThan(2600)
  })

  it('flags wrong_direction when gaining against a loss goal', () => {
    const trend = computeTrend(weekOfLogs(200, 0.12), -0.5)
    expect(trend.status).toBe('wrong_direction')
    expect(suggestCalories(2600, trend)).toBeLessThan(2600)
  })

  it('uses configured height for body ratios and optional limb fields', () => {
    const [row] = measurementRows(
      [{ date: '2026-08-01', shoulder: 50, waist: 36, chest: 46, arm: 15, hip: 40 }],
      72,
    )
    expect(row.waistHeight).toBe(0.5)
    expect(row.shoulderWaist).toBeCloseTo(1.389)
    expect(row.waistHip).toBeCloseTo(0.9)
    expect(row.arm).toBe(15)
  })

  it('surfaces consistency, training, and measurement alerts', () => {
    const alerts = buildInsights(normalizeLedger({}), '2026-08-06')
    expect(alerts.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Log today', 'Consistency', 'Training', 'Measurements']),
    )
  })
})
