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
  const empty = {
    date: todayISO(),
    shoulder: '',
    waist: '',
    chest: '',
    arm: '',
    thigh: '',
    hip: '',
    neck: '',
    notes: '',
  }
  const [form, setForm] = useState(() =>
    edit
      ? Object.fromEntries(
          Object.entries({ ...empty, ...edit }).map(([key, value]) => [key, value ?? '']),
        )
      : empty,
  )
  const [status, setStatus] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!form.date || ['shoulder', 'waist', 'chest'].some((key) => form[key] === '')) {
      return setStatus({ tone: 'error', text: 'Date, shoulders, waist, and chest are required.' })
    }
    try {
      await actions.upsertMeasurement({
        date: form.date,
        shoulder: Number(form.shoulder),
        waist: Number(form.waist),
        chest: Number(form.chest),
        arm: numberOrNull(form.arm),
        thigh: numberOrNull(form.thigh),
        hip: numberOrNull(form.hip),
        neck: numberOrNull(form.neck),
        notes: form.notes || '',
      })
      setStatus({ tone: 'success', text: 'Measurements saved.' })
      setForm(empty)
      onDone()
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid four">
        <Field label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        {['shoulder', 'waist', 'chest', 'arm'].map((key) => (
          <Field key={key} label={`${key[0].toUpperCase() + key.slice(1)} (in)`} type="number" step="0.1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        ))}
      </div>
      <div className="form-grid three">
        {['thigh', 'hip', 'neck'].map((key) => (
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
    goalWeightLb: ledger.goals.weightLb ?? '',
    goalRateLbWeek: ledger.goals.rateLbWeek,
    goalMode: ledger.goals.mode,
    geminiApiKey: '',
  })
  const [status, setStatus] = useState(null)

  async function submit(event) {
    event.preventDefault()
    try {
      const payload = {
        calories: Number(form.calories),
        protein: Number(form.protein),
        heightIn: Number(form.heightIn),
        goalWeightLb: form.goalWeightLb === '' ? null : Number(form.goalWeightLb),
        goalRateLbWeek: Number(form.goalRateLbWeek),
        goalMode: form.goalMode,
      }
      if (form.geminiApiKey.trim()) {
        payload.geminiApiKey = form.geminiApiKey.trim()
      }
      await actions.updateSettings(payload)
      setForm((current) => ({ ...current, geminiApiKey: '' }))
      setStatus({ tone: 'success', text: 'Targets updated.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error.message })
    }
  }

  async function clearKey() {
    try {
      await actions.updateSettings({
        calories: Number(form.calories),
        protein: Number(form.protein),
        heightIn: Number(form.heightIn),
        goalWeightLb: form.goalWeightLb === '' ? null : Number(form.goalWeightLb),
        goalRateLbWeek: Number(form.goalRateLbWeek),
        goalMode: form.goalMode,
        clearGeminiKey: true,
      })
      setForm((current) => ({ ...current, geminiApiKey: '' }))
      setStatus({ tone: 'success', text: 'Gemini API key cleared.' })
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
      <div className="form-grid three">
        <label className="field">
          <span>Goal mode</span>
          <select value={form.goalMode} onChange={(e) => setForm({ ...form, goalMode: e.target.value })}>
            <option value="cut">Cut</option>
            <option value="recomp">Recomp</option>
            <option value="bulk">Bulk</option>
          </select>
        </label>
        <Field
          label="Goal weight (lb)"
          type="number"
          step="0.1"
          value={form.goalWeightLb}
          onChange={(e) => setForm({ ...form, goalWeightLb: e.target.value })}
          placeholder="Optional"
        />
        <Field
          label="Goal rate (lb / week)"
          type="number"
          step="0.05"
          value={form.goalRateLbWeek}
          onChange={(e) => setForm({ ...form, goalRateLbWeek: e.target.value })}
        />
      </div>
      <p className="field-hint">Negative rate = lose weight. Example: −0.5 lb/week for a slow recomp cut.</p>
      <div className="form-grid two">
        <Field
          label={ledger.hasGeminiKey ? 'Replace Gemini API key' : 'Gemini API key'}
          type="password"
          autoComplete="off"
          value={form.geminiApiKey}
          onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
          placeholder={ledger.hasGeminiKey ? '•••••••• (saved)' : 'Paste key from Google AI Studio'}
        />
        <div className="field-actions">
          <span className="field-label-spacer">Key status</span>
          <p className="key-status">{ledger.hasGeminiKey ? 'Key on file' : 'No key saved'}</p>
          {ledger.hasGeminiKey && (
            <button type="button" className="quiet" onClick={clearKey}>Clear key</button>
          )}
        </div>
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
      <HistoryTable title="Measurements" columns={['Date', 'Shoulders', 'Waist', 'Chest', 'Arm', 'Thigh', 'W:H', '']} rows={measurements.map((row) => [
        row.date, row.shoulder, row.waist, row.chest, row.arm ?? '—', row.thigh ?? '—', row.waistHeight?.toFixed(2) || '—',
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

