import { useState } from 'react'
import { measurementRows, sortByDate } from '../lib/ledger'
import { useLedger } from '../state/LedgerContext'

function download(filename, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function toCsv(rows, columns) {
  const escape = (value) => {
    if (value == null) return ''
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [columns.join(','), ...rows.map((row) => columns.map((key) => escape(row[key])).join(','))].join('\n')
}

export function DataControls() {
  const { ledger, pendingImport, importLocal, dismissImport, actions } = useLedger()
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    download(
      'daily-log.csv',
      toCsv(sortByDate(ledger.dailyLogs), ['date', 'weight', 'calories', 'protein', 'carbs', 'fat']),
      'text/csv',
    )
    const measurements = measurementRows(ledger.measurements, ledger.heightIn).map((row) => ({
      date: row.date,
      shoulder: row.shoulder,
      waist: row.waist,
      chest: row.chest,
      shoulder_waist_ratio: row.shoulderWaist?.toFixed(2),
      chest_waist_ratio: row.chestWaist?.toFixed(2),
      waist_height_ratio: row.waistHeight?.toFixed(2),
      notes: row.notes,
    }))
    setTimeout(
      () =>
        download(
          'measurements.csv',
          toCsv(measurements, [
            'date',
            'shoulder',
            'waist',
            'chest',
            'shoulder_waist_ratio',
            'chest_waist_ratio',
            'waist_height_ratio',
            'notes',
          ]),
          'text/csv',
        ),
      250,
    )
    setTimeout(
      () =>
        download(
          'workouts.csv',
          toCsv(sortByDate(ledger.workouts), [
            'date',
            'split',
            'exercise',
            'weight',
            'sets',
            'reps',
            'notes',
          ]),
          'text/csv',
        ),
      500,
    )
  }

  return (
    <>
      {pendingImport && (
        <aside className="import-banner">
          <div>
            <strong>Local history found</strong>
            <p>Cloud is empty. Import this device’s cached logs before creating new entries.</p>
          </div>
          <div>
            <button className="primary" disabled={busy} onClick={() => run(importLocal)}>Import history</button>
            <button className="quiet" disabled={busy} onClick={() => confirm('Discard local history and use empty cloud data?') && run(dismissImport)}>Discard cache</button>
          </div>
        </aside>
      )}
      <footer className="app-footer">
        <span>Recomp Ledger · Your data, your signal.</span>
        <div>
          <button className="quiet" onClick={exportCsv}>Export CSV</button>
          <button className="quiet" onClick={() => download('recomp-ledger-backup.json', JSON.stringify(ledger, null, 2))}>Export JSON</button>
          <button className="danger-text" onClick={() => confirm('Permanently reset every ledger entry?') && run(actions.reset)}>Reset ledger</button>
        </div>
      </footer>
    </>
  )
}

