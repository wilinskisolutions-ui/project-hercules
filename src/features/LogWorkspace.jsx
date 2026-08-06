import { useState } from 'react'
import { measurementRows, sortByDate, todayISO } from '../lib/ledger'
import { useLedger } from '../state/LedgerContext'

const numberOrNull = (value) => (value === '' ? null : Number(value))

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  )
}

function FormStatus({ status }) {
  return status ? <p className={`form-status ${status.tone}`}>{status.text}</p> : null
}

function DailyForm({ edit, onDone }) {
  const { actions } = useLedger()
  const [form, setForm] = useState(() =>
    edit
      ? Object.fromEntries(Object.entries(edit).map(([key, value]) => [key, value ?? '']))
      : { date: todayISO(), weight: '', calories: '', protein: '', carbs: '', fat: '' },
  )
  const [status, setStatus] = useState(null)

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.date || form.weight === '') return setStatus({ tone: 'error', text: 'Date and weight are required.' })
    try {
      await actions.upsertDaily({
        date: form.date,
        weight: Number(form.weight),
        calories: numberOrNull(form.calories),
        protein: numberOrNull(form.protein),
        carbs: numberOrNull(form.carbs),
        fat: numberOrNull(form.fat),
      })
      setStatus({ tone: 'success', text: 'Daily log saved.' })
      setForm({ date: todayISO(), weight: '', calories: '', protein: '', carbs: '', fat: '' })
      onDone()
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Date" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
        <Field label="Morning weight (lb)" type="number" step="0.1" value={form.weight} onChange={(e) => update('weight', e.target.value)} />
      </div>
      <div className="form-grid four">
        {['calories', 'protein', 'carbs', 'fat'].map((key) => (
          <Field key={key} label={key === 'calories' ? 'Calories' : `${key[0].toUpperCase() + key.slice(1)} (g)`} type="number" value={form[key]} onChange={(e) => update(key, e.target.value)} />
        ))}
      </div>
      <div className="form-footer">
        <FormStatus status={status} />
        <button className="primary" type="submit">{edit ? 'Update day' : 'Save day'}</button>
      </div>
    </form>
  )
}

function MeasurementForm({ edit, onDone }) {
  const { actions } = useLedger()
  const [form, setForm] = useState(() =>
    edit
      ? Object.fromEntries(Object.entries(edit).map(([key, value]) => [key, value ?? '']))
      : { date: todayISO(), shoulder: '', waist: '', chest: '', notes: '' },
  )
  const [status, setStatus] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!form.date || ['shoulder', 'waist', 'chest'].some((key) => form[key] === '')) {
      return setStatus({ tone: 'error', text: 'Date, shoulders, waist, and chest are required.' })
    }
    try {
      await actions.upsertMeasurement({
        ...form,
        shoulder: Number(form.shoulder),
        waist: Number(form.waist),
        chest: Number(form.chest),
      })
      setStatus({ tone: 'success', text: 'Measurements saved.' })
      setForm({ date: todayISO(), shoulder: '', waist: '', chest: '', notes: '' })
      onDone()
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid four">
        <Field label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        {['shoulder', 'waist', 'chest'].map((key) => (
          <Field key={key} label={`${key[0].toUpperCase() + key.slice(1)} (in)`} type="number" step="0.1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        ))}
      </div>
      <Field label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Fit, visual changes, context…" />
      <div className="form-footer">
        <FormStatus status={status} />
        <button className="primary" type="submit">{edit ? 'Update measurements' : 'Save measurements'}</button>
      </div>
    </form>
  )
}

function WorkoutForm({ edit, onDone }) {
  const { actions } = useLedger()
  const [form, setForm] = useState(() =>
    edit
      ? Object.fromEntries(Object.entries(edit).map(([key, value]) => [key, value ?? '']))
      : { date: todayISO(), split: '', exercise: '', weight: '', sets: '', reps: '', notes: '' },
  )
  const [status, setStatus] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!form.date || !form.split.trim()) return setStatus({ tone: 'error', text: 'Date and training split are required.' })
    try {
      await actions.upsertWorkout({
        ...form,
        split: form.split.trim(),
        exercise: form.exercise.trim(),
        weight: numberOrNull(form.weight),
        sets: numberOrNull(form.sets),
        reps: numberOrNull(form.reps),
      })
      setStatus({ tone: 'success', text: 'Workout saved.' })
      setForm({ date: todayISO(), split: '', exercise: '', weight: '', sets: '', reps: '', notes: '' })
      onDone()
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid three">
        <Field label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Field label="Split / muscle group" value={form.split} onChange={(e) => setForm({ ...form, split: e.target.value })} placeholder="Push, pull, legs…" />
        <Field label="Main exercise" value={form.exercise} onChange={(e) => setForm({ ...form, exercise: e.target.value })} placeholder="Bench press" />
      </div>
      <div className="form-grid three">
        {['weight', 'sets', 'reps'].map((key) => (
          <Field key={key} label={key === 'weight' ? 'Weight (lb)' : key[0].toUpperCase() + key.slice(1)} type="number" step={key === 'weight' ? '0.5' : '1'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        ))}
      </div>
      <Field label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="RPE, form, progress…" />
      <div className="form-footer">
        <FormStatus status={status} />
        <button className="primary" type="submit">{edit ? 'Update workout' : 'Log workout'}</button>
      </div>
    </form>
  )
}

function SettingsForm() {
  const { ledger, actions } = useLedger()
  const [form, setForm] = useState({
    calories: ledger.targets.calories,
    protein: ledger.targets.protein,
    heightIn: ledger.heightIn,
  })
  const [status, setStatus] = useState(null)

  async function submit(event) {
    event.preventDefault()
    try {
      await actions.updateSettings(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)])))
      setStatus({ tone: 'success', text: 'Targets updated.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid three">
        <Field label="Calories / day" type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} />
        <Field label="Protein (g / day)" type="number" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} />
        <Field label="Height (in)" type="number" step="0.1" value={form.heightIn} onChange={(e) => setForm({ ...form, heightIn: e.target.value })} />
      </div>
      <div className="form-footer">
        <FormStatus status={status} />
        <button className="primary" type="submit">Save targets</button>
      </div>
    </form>
  )
}

function History({ onEdit }) {
  const { ledger, actions } = useLedger()
  const daily = sortByDate(ledger.dailyLogs).reverse()
  const measurements = measurementRows(ledger.measurements, ledger.heightIn).reverse()
  const workouts = sortByDate(ledger.workouts).reverse()
  return (
    <div className="history-stack">
      <HistoryTable title="Daily logs" columns={['Date', 'Weight', 'Calories', 'Protein', '']} rows={daily.map((row) => [
        row.date, `${row.weight} lb`, row.calories ?? '—', row.protein ? `${row.protein}g` : '—',
        <RowActions key={row.date} onEdit={() => onEdit('daily', row)} onDelete={() => actions.deleteDaily(row.date)} />,
      ])} />
      <HistoryTable title="Measurements" columns={['Date', 'Shoulders', 'Waist', 'Chest', 'W:H', '']} rows={measurements.map((row) => [
        row.date, row.shoulder, row.waist, row.chest, row.waistHeight?.toFixed(2) || '—',
        <RowActions key={row.date} onEdit={() => onEdit('measurement', row)} onDelete={() => actions.deleteMeasurement(row.date)} />,
      ])} />
      <HistoryTable title="Workouts" columns={['Date', 'Split', 'Exercise', 'Load', 'Sets × reps', '']} rows={workouts.map((row) => [
        row.date, row.split, row.exercise || '—', row.weight ? `${row.weight} lb` : '—', row.sets && row.reps ? `${row.sets} × ${row.reps}` : '—',
        <RowActions key={row.id} onEdit={() => onEdit('workout', row)} onDelete={() => actions.deleteWorkout(row.id)} />,
      ])} />
      <HistoryTable title="Target adjustments" columns={['Date', 'Calories', 'Reason']} rows={sortByDate(ledger.adjustments).reverse().map((row) => [row.date, row.calories, row.reason])} />
    </div>
  )
}

function RowActions({ onEdit, onDelete }) {
  return <div className="row-actions"><button onClick={onEdit}>Edit</button><button className="danger" onClick={() => confirm('Delete this entry?') && onDelete()}>Delete</button></div>
}

function HistoryTable({ title, columns, rows }) {
  return (
    <section className="table-card">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((cells, index) => <tr key={index}>{cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
      ) : <p className="empty-state compact">No entries yet.</p>}
    </section>
  )
}

const tabs = [
  ['daily', 'Daily log'],
  ['measurement', 'Measurements'],
  ['workout', 'Workout'],
  ['settings', 'Targets'],
  ['history', 'History'],
]

export function LogWorkspace({ activeTab, onTabChange }) {
  const [edit, setEdit] = useState(null)
  function editRow(tab, row) {
    setEdit(row)
    onTabChange(tab)
  }
  function done() {
    setEdit(null)
  }
  return (
    <section className="workspace" id="log">
      <div className="section-heading">
        <div><span>Record the work</span><h2>Ledger entries</h2></div>
      </div>
      <nav className="tabs" aria-label="Ledger sections">
        {tabs.map(([id, label]) => <button className={activeTab === id ? 'active' : ''} key={id} onClick={() => { setEdit(null); onTabChange(id) }}>{label}</button>)}
      </nav>
      <div className="panel form-panel">
        {activeTab === 'daily' && <DailyForm key={edit?.date || 'new-daily'} edit={edit} onDone={done} />}
        {activeTab === 'measurement' && <MeasurementForm key={edit?.date || 'new-measurement'} edit={edit} onDone={done} />}
        {activeTab === 'workout' && <WorkoutForm key={edit?.id || 'new-workout'} edit={edit} onDone={done} />}
        {activeTab === 'settings' && <SettingsForm />}
        {activeTab === 'history' && <History onEdit={editRow} />}
      </div>
    </section>
  )
}

