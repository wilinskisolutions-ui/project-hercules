import { useState } from 'react'
import { LedgerCharts } from './charts/LedgerCharts'
import { DashboardHeader } from './components/DashboardHeader'
import { DataControls } from './components/DataControls'
import { Overview } from './components/Overview'
import { UnlockGate } from './components/UnlockGate'
import { LogWorkspace } from './features/LogWorkspace'
import { useLedger } from './state/LedgerContext'

export default function App() {
  const { authState, ledger, syncState } = useLedger()
  const [activeTab, setActiveTab] = useState('daily')

  if (authState !== 'unlocked') return <UnlockGate />

  function navigate(tab) {
    setActiveTab(tab)
    requestAnimationFrame(() => document.getElementById('log')?.scrollIntoView({ behavior: 'smooth' }))
  }

  return (
    <>
      <DashboardHeader />
      <main className="app-shell" id="top">
        <div className={`sync-banner ${syncState.status}`} role="status">
          <i />
          {syncState.message}
        </div>
        <Overview ledger={ledger} onNavigate={navigate} />
        <LedgerCharts ledger={ledger} />
        <LogWorkspace activeTab={activeTab} onTabChange={setActiveTab} />
        <DataControls />
      </main>
    </>
  )
}

