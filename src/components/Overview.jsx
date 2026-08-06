import { averageRecent, buildInsights, computeTrend, rollingSeries } from '../lib/ledger'
import { useLedger } from '../state/LedgerContext'

function trendCopy(trend) {
  if (trend.status === 'too_fast') return ['Reduce the pace', 'Weight is dropping faster than the muscle-preserving range.']
  if (trend.status === 'gaining') return ['Course correct', 'Your average is moving up. Review intake accuracy and target.']
  if (trend.status === 'plateau') return ['Plateau detected', 'Your average has been flat across multiple weeks.']
  if (trend.status === 'on_track') return ['On track', 'Your average is moving through the recomp target range.']
  return ['Building signal', 'Keep logging daily. A reliable trend needs about 10 days.']
}

export function Overview({ ledger, onNavigate }) {
  const { actions } = useLedger()
  const series = rollingSeries(ledger.dailyLogs)
  const latest = series.at(-1)
  const trend = computeTrend(ledger.dailyLogs)
  const [trendTitle, trendText] = trendCopy(trend)
  const averageCalories = averageRecent(ledger.dailyLogs, 'calories')
  const averageProtein = averageRecent(ledger.dailyLogs, 'protein')
  const insights = buildInsights(ledger)
  const suggestedCalories =
    trend.status === 'too_fast'
      ? ledger.targets.calories + 125
      : trend.status === 'plateau'
        ? ledger.targets.calories - 125
        : trend.status === 'gaining'
          ? ledger.targets.calories - 150
          : null

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Today’s command center</p>
          <h1>Your body is a trend,<br />not a single number.</h1>
          <p className="hero-copy">
            Log consistently. Read the signal. Make the smallest useful adjustment.
          </p>
        </div>
        <div className={`verdict ${trend.status}`}>
          <span>Current read</span>
          <strong>{trendTitle}</strong>
          <p>{trendText}</p>
          {trend.rate != null && <b>{trend.rate > 0 ? '+' : ''}{trend.rate.toFixed(2)} lb / week</b>}
          {suggestedCalories && (
            <button
              className="verdict-action"
              onClick={() =>
                actions.applyAdjustment(
                  suggestedCalories,
                  `AWW ${trend.status.replace('_', ' ')} at ${trend.rate.toFixed(2)} lb/week`,
                )
              }
            >
              Apply {suggestedCalories.toLocaleString()} kcal
            </button>
          )}
        </div>
      </section>

      <section className="metric-grid" aria-label="Current metrics">
        <article className="metric">
          <span>7-day average</span>
          <strong>{latest ? latest.aww.toFixed(1) : '—'} <small>lb</small></strong>
          <p>{ledger.dailyLogs.length} weigh-ins recorded</p>
        </article>
        <article className="metric">
          <span>Calorie target</span>
          <strong>{ledger.targets.calories.toLocaleString()} <small>kcal</small></strong>
          <p>{averageCalories ? `${Math.round(averageCalories).toLocaleString()} recent average` : 'Waiting for nutrition logs'}</p>
        </article>
        <article className="metric">
          <span>Protein target</span>
          <strong>{ledger.targets.protein} <small>g</small></strong>
          <p>{averageProtein ? `${Math.round(averageProtein)}g recent average` : 'Waiting for nutrition logs'}</p>
        </article>
        <article className="metric">
          <span>Training volume</span>
          <strong>{ledger.workouts.length} <small>sessions</small></strong>
          <p>All-time logged workouts</p>
        </article>
      </section>

      <section className="insight-section">
        <div className="section-heading">
          <div>
            <span>Coach’s notes</span>
            <h2>What deserves attention</h2>
          </div>
        </div>
        <div className="insight-grid">
          {insights.slice(0, 4).map((item) => (
            <button className={`insight-card ${item.tone}`} key={`${item.label}-${item.text}`} onClick={() => onNavigate(item.tab)}>
              <i />
              <span>
                <strong>{item.label}</strong>
                <small>{item.text}</small>
              </span>
              <b>→</b>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

