import { useState } from 'react'
import {
  averageRecent,
  buildInsights,
  computeTrend,
  rollingSeries,
  suggestCalories,
} from '../lib/ledger'
import { useLedger } from '../state/LedgerContext'

function trendCopy(trend) {
  if (trend.status === 'too_fast') {
    return ['Reduce the pace', 'Average weekly weight is changing faster than your goal rate.']
  }
  if (trend.status === 'too_slow') {
    return ['Nudge the target', 'Average weekly weight is lagging your goal rate.']
  }
  if (trend.status === 'wrong_direction') {
    return ['Course correct', 'Average weekly weight is moving opposite your goal.']
  }
  if (trend.status === 'on_track') {
    return ['On track', 'Your average is tracking the goal rate band.']
  }
  return ['Building signal', 'Keep logging daily. A reliable trend needs about 10 days.']
}

function formatRate(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const number = Number(value)
  return `${number > 0 ? '+' : ''}${number.toFixed(2)} lb / week`
}

export function Overview({ ledger, onNavigate }) {
  const { actions } = useLedger()
  const series = rollingSeries(ledger.dailyLogs)
  const latest = series.at(-1)
  const trend = computeTrend(ledger.dailyLogs, ledger.goals.rateLbWeek)
  const [trendTitle, trendText] = trendCopy(trend)
  const averageCalories = averageRecent(ledger.dailyLogs, 'calories')
  const averageProtein = averageRecent(ledger.dailyLogs, 'protein')
  const insights = buildInsights(ledger)
  const suggestedCalories = suggestCalories(ledger.targets.calories, trend)
  const [aiState, setAiState] = useState({ status: 'idle', advice: '', error: '', model: '' })

  async function runAnalyze() {
    setAiState({ status: 'loading', advice: '', error: '', model: '' })
    try {
      const result = await actions.analyze()
      setAiState({
        status: 'ready',
        advice: result.advice || '',
        error: '',
        model: result.model || '',
      })
    } catch (error) {
      setAiState({
        status: 'error',
        advice: '',
        error: error.message || 'Analysis failed',
        model: '',
      })
    }
  }

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
          {trend.rate != null && (
            <b>
              {formatRate(trend.rate)}
              <span className="verdict-goal"> · goal {formatRate(trend.goalRate)}</span>
            </b>
          )}
          {suggestedCalories && (
            <button
              className="verdict-action"
              onClick={() =>
                actions.applyAdjustment(
                  suggestedCalories,
                  `AWW ${trend.rate.toFixed(2)} vs goal ${Number(trend.goalRate).toFixed(2)} lb/week (${trend.status.replaceAll('_', ' ')})`,
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
          <span>Goal rate</span>
          <strong>{formatRate(ledger.goals.rateLbWeek).replace(' lb / week', '')} <small>lb/wk</small></strong>
          <p>
            {ledger.goals.mode}
            {ledger.goals.weightLb != null ? ` · goal ${ledger.goals.weightLb} lb` : ''}
          </p>
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

      <section className="panel ai-coach">
        <div className="section-heading">
          <div>
            <span>Gemini coach</span>
            <h2>Trend analysis</h2>
          </div>
          <button
            className="primary"
            disabled={aiState.status === 'loading'}
            onClick={runAnalyze}
          >
            {aiState.status === 'loading' ? 'Analyzing…' : 'Analyze trends'}
          </button>
        </div>
        {!ledger.hasGeminiKey && (
          <p className="ai-hint">
            Add a Gemini API key under Targets to enable AI coaching.
            <button className="quiet" type="button" onClick={() => onNavigate('settings')}>Open Targets</button>
          </p>
        )}
        {aiState.error && <p className="form-status error">{aiState.error}</p>}
        {aiState.advice && (
          <div className="ai-advice">
            <p>{aiState.advice}</p>
            {aiState.model && <small>Model: {aiState.model}</small>}
          </div>
        )}
      </section>
    </>
  )
}
