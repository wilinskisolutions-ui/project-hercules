import { useLedger } from '../state/LedgerContext'

const syncLabels = {
  idle: 'Offline',
  syncing: 'Syncing',
  success: 'Synced',
  warning: 'Needs attention',
  error: 'Sync issue',
}

export function DashboardHeader() {
  const { lock, syncState } = useLedger()
  return (
    <header className="app-header">
      <a className="brand" href="#top">
        <span className="brand-mark small">RL</span>
        <span>
          <strong>Recomp Ledger</strong>
          <small>Performance journal</small>
        </span>
      </a>
      <div className="header-actions">
        <div className={`sync-pill ${syncState.status}`} title={syncState.message}>
          <i />
          {syncLabels[syncState.status] || 'Sync'}
        </div>
        <button className="quiet" onClick={lock}>Lock</button>
      </div>
    </header>
  )
}

