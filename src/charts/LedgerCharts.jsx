import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { rollingSeries, sortByDate } from '../lib/ledger'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const options = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { labels: { color: '#aaa99f', usePointStyle: true, boxWidth: 8 } },
  },
  scales: {
    x: { ticks: { color: '#7f8078', maxTicksLimit: 7 }, grid: { display: false } },
    y: { ticks: { color: '#7f8078' }, grid: { color: 'rgba(255,255,255,.06)' } },
  },
}

function ChartCard({ title, kicker, children, empty }) {
  return (
    <section className="panel chart-card">
      <div className="section-heading">
        <div>
          <span>{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {empty ? <div className="empty-state">{empty}</div> : <div className="chart-frame">{children}</div>}
    </section>
  )
}

export function LedgerCharts({ ledger }) {
  const weight = rollingSeries(ledger.dailyLogs)
  const calories = sortByDate(ledger.dailyLogs).filter((item) => item.calories != null).slice(-28)
  const measurements = sortByDate(ledger.measurements)

  return (
    <div className="chart-grid">
      <ChartCard
        title="Weight trajectory"
        kicker="7-day signal"
        empty={weight.length < 2 ? 'Add two weigh-ins to reveal the trend.' : null}
      >
        <Line
          options={options}
          data={{
            labels: weight.map((item) => item.date.slice(5)),
            datasets: [
              {
                label: 'Daily',
                data: weight.map((item) => item.weight),
                borderColor: '#6f7669',
                backgroundColor: '#6f7669',
                showLine: false,
                pointRadius: 3,
              },
              {
                label: '7-day average',
                data: weight.map((item) => item.aww),
                borderColor: '#d8a657',
                backgroundColor: 'rgba(216,166,87,.12)',
                fill: true,
                pointRadius: 0,
                tension: 0.3,
              },
            ],
          }}
        />
      </ChartCard>

      <ChartCard
        title="Calorie adherence"
        kicker="Last 28 entries"
        empty={calories.length < 2 ? 'Log calories twice to compare against your target.' : null}
      >
        <Line
          options={options}
          data={{
            labels: calories.map((item) => item.date.slice(5)),
            datasets: [
              {
                label: 'Calories',
                data: calories.map((item) => item.calories),
                borderColor: '#d8a657',
                backgroundColor: '#d8a657',
                tension: 0.25,
                pointRadius: 2,
              },
              {
                label: 'Target',
                data: calories.map(() => ledger.targets.calories),
                borderColor: '#6e9d84',
                borderDash: [5, 5],
                pointRadius: 0,
              },
            ],
          }}
        />
      </ChartCard>

      <ChartCard
        title="Body measurements"
        kicker="Shape over scale"
        empty={measurements.length < 2 ? 'Add two measurement check-ins to chart body changes.' : null}
      >
        <Line
          options={options}
          data={{
            labels: measurements.map((item) => item.date.slice(5)),
            datasets: [
              { label: 'Waist', data: measurements.map((item) => item.waist), borderColor: '#d36b5c' },
              { label: 'Shoulders', data: measurements.map((item) => item.shoulder), borderColor: '#6e9d84' },
              { label: 'Chest', data: measurements.map((item) => item.chest), borderColor: '#d8a657' },
              {
                label: 'Arm',
                data: measurements.map((item) => item.arm),
                borderColor: '#7aa2c8',
                spanGaps: true,
              },
              {
                label: 'Thigh',
                data: measurements.map((item) => item.thigh),
                borderColor: '#b08d6a',
                spanGaps: true,
              },
            ].map((dataset) => ({ ...dataset, pointRadius: 2, tension: 0.25 })),
          }}
        />
      </ChartCard>
    </div>
  )
}

