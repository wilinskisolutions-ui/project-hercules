import { describe, expect, it } from 'vitest'
import {
  buildInsights,
  computeTrend,
  measurementRows,
  normalizeLedger,
  rollingSeries,
} from './ledger'

describe('ledger calculations', () => {
  it('normalizes missing collections and defaults', () => {
    expect(normalizeLedger({})).toMatchObject({
      dailyLogs: [],
      measurements: [],
      workouts: [],
      targets: { calories: 2600, protein: 200 },
      heightIn: 75,
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
    ).toEqual({ status: 'logging', rate: null })
  })

  it('uses configured height for body ratios', () => {
    const [row] = measurementRows(
      [{ date: '2026-08-01', shoulder: 50, waist: 36, chest: 46 }],
      72,
    )
    expect(row.waistHeight).toBe(0.5)
    expect(row.shoulderWaist).toBeCloseTo(1.389)
  })

  it('surfaces consistency, training, and measurement alerts', () => {
    const alerts = buildInsights(normalizeLedger({}), '2026-08-06')
    expect(alerts.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Log today', 'Consistency', 'Training', 'Measurements']),
    )
  })
})

