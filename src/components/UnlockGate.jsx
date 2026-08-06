import { useState } from 'react'
import { useLedger } from '../state/LedgerContext'

export function UnlockGate() {
  const { unlock, authState } = useLedger()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await unlock(passphrase)
    } catch (caught) {
      setError(caught.message)
    }
  }

  return (
    <main className="unlock-shell">
      <section className="unlock-copy">
        <div className="brand-mark">RL</div>
        <p className="eyebrow">Private performance journal</p>
        <h1>Make progress<br />visible.</h1>
        <p>
          One place for weight, nutrition, measurements, and training—translated into a signal you can act on.
        </p>
      </section>
      <form className="unlock-card" onSubmit={submit}>
        <div>
          <span className="step-label">Secure workspace</span>
          <h2>Open your ledger</h2>
          <p>Your passphrase stays in this browser session.</p>
        </div>
        <label>
          Passphrase
          <input
            autoFocus
            autoComplete="current-password"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Enter passphrase"
          />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary" disabled={authState === 'unlocking'} type="submit">
          {authState === 'unlocking' ? 'Opening…' : 'Open ledger'}
        </button>
        <small>Encrypted in transit · synced through Supabase</small>
      </form>
    </main>
  )
}

