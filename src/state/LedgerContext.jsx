/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LedgerError, ledgerApi } from '../api/ledger'
import { EMPTY_LEDGER, isLedgerEmpty, normalizeLedger } from '../lib/ledger'

const STORAGE_KEY = 'physique-data'
const PASS_KEY = 'ledger-passphrase'
const LedgerContext = createContext(null)

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeLedger(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeCache(ledger) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger))
  } catch {
    // Cloud remains authoritative if browser storage is unavailable.
  }
}

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function LedgerProvider({ children }) {
  const initialLedger = readCache() || normalizeLedger(EMPTY_LEDGER)
  const [ledger, setLedgerState] = useState(initialLedger)
  const [authState, setAuthState] = useState('locked')
  const [syncState, setSyncState] = useState({ status: 'idle', message: 'Unlock to sync' })
  const [pendingImport, setPendingImport] = useState(null)
  const ledgerRef = useRef(initialLedger)
  const passphraseRef = useRef(sessionStorage.getItem(PASS_KEY)?.trim() || '')
  const importPromiseRef = useRef(null)
  const autoUnlockAttemptedRef = useRef(false)

  const commitLedger = useCallback((next) => {
    const normalized = normalizeLedger(next)
    ledgerRef.current = normalized
    setLedgerState(normalized)
    writeCache(normalized)
    return normalized
  }, [])

  const setSync = useCallback((status, message) => setSyncState({ status, message }), [])

  const bootstrap = useCallback(async (passphrase) => {
    const trimmed = passphrase.trim()
    if (!trimmed) throw new LedgerError('Enter your passphrase.', { code: 'EMPTY_PASSPHRASE' })
    setAuthState('unlocking')
    const cloud = normalizeLedger(await ledgerApi.bootstrap(trimmed))
    passphraseRef.current = trimmed
    sessionStorage.setItem(PASS_KEY, trimmed)
    setAuthState('unlocked')

    const cached = readCache()
    if (cloud.empty && cached && !isLedgerEmpty(cached)) {
      ledgerRef.current = cached
      setLedgerState(cached)
      setPendingImport(cached)
      setSync('warning', 'Local history is ready to import')
    } else {
      commitLedger(cloud)
      setPendingImport(null)
      setSync('success', 'Synced to Supabase')
    }
    return cloud
  }, [commitLedger, setSync])

  const unlock = useCallback(async (passphrase) => {
    try {
      return await bootstrap(passphrase)
    } catch (error) {
      passphraseRef.current = ''
      sessionStorage.removeItem(PASS_KEY)
      setAuthState('locked')
      throw error
    }
  }, [bootstrap])

  const lock = useCallback(() => {
    passphraseRef.current = ''
    sessionStorage.removeItem(PASS_KEY)
    setAuthState('locked')
    setSync('idle', 'Unlock to sync')
  }, [setSync])

  useEffect(() => {
    if (autoUnlockAttemptedRef.current) return
    autoUnlockAttemptedRef.current = true
    const stored = passphraseRef.current
    if (!stored) return
    bootstrap(stored).catch(() => {
      passphraseRef.current = ''
      sessionStorage.removeItem(PASS_KEY)
      setAuthState('locked')
    })
  }, [bootstrap])

  const importLocal = useCallback(async () => {
    if (!pendingImport) return ledgerRef.current
    if (importPromiseRef.current) return importPromiseRef.current
    importPromiseRef.current = (async () => {
      setSync('syncing', 'Importing local history…')
      const imported = normalizeLedger(
        await ledgerApi.mutate(passphraseRef.current, 'import_state', {
          state: ledgerRef.current,
        }),
      )
      commitLedger(imported)
      setPendingImport(null)
      setSync('success', 'Local history imported')
      return imported
    })()
    try {
      return await importPromiseRef.current
    } finally {
      importPromiseRef.current = null
    }
  }, [commitLedger, pendingImport, setSync])

  const dismissImport = useCallback(async () => {
    const cloud = normalizeLedger(await ledgerApi.bootstrap(passphraseRef.current))
    setPendingImport(null)
    commitLedger(cloud)
    setSync('success', 'Using cloud data')
  }, [commitLedger, setSync])

  const mutate = useCallback(async (op, payload, optimisticUpdate) => {
    setSync('syncing', 'Saving…')
    let before = ledgerRef.current
    try {
      if (pendingImport) await importLocal()
      before = ledgerRef.current
      commitLedger(optimisticUpdate(before))
      const result = await ledgerApi.mutate(passphraseRef.current, op, payload)
      setSync('success', 'Saved to Supabase')
      return result
    } catch (error) {
      commitLedger(before)
      if (error.code === 'UNAUTHORIZED') {
        setSync('error', 'Sync unauthorized — unlock again')
      } else {
        setSync('error', error.message)
      }
      throw error
    }
  }, [commitLedger, importLocal, pendingImport, setSync])

  const actions = useMemo(() => ({
    upsertDaily: (row) =>
      mutate('upsert_daily', { row }, (current) => ({
        ...current,
        dailyLogs: [...current.dailyLogs.filter((item) => item.date !== row.date), row],
      })),
    deleteDaily: (date) =>
      mutate('delete_daily', { date }, (current) => ({
        ...current,
        dailyLogs: current.dailyLogs.filter((item) => item.date !== date),
      })),
    upsertMeasurement: (row) =>
      mutate('upsert_measurement', { row }, (current) => ({
        ...current,
        measurements: [...current.measurements.filter((item) => item.date !== row.date), row],
      })),
    deleteMeasurement: (date) =>
      mutate('delete_measurement', { date }, (current) => ({
        ...current,
        measurements: current.measurements.filter((item) => item.date !== date),
      })),
    upsertWorkout: async (input) => {
      const row = { ...input, id: input.id || makeUuid() }
      const result = await mutate('upsert_workout', { row }, (current) => ({
        ...current,
        workouts: [...current.workouts.filter((item) => item.id !== row.id), row],
      }))
      const serverId = result?.id || row.id
      if (serverId !== row.id) {
        commitLedger({
          ...ledgerRef.current,
          workouts: ledgerRef.current.workouts.map((item) =>
            item.id === row.id ? { ...item, id: serverId } : item,
          ),
        })
      }
      return { ...row, id: serverId }
    },
    deleteWorkout: (id) =>
      mutate('delete_workout', { id }, (current) => ({
        ...current,
        workouts: current.workouts.filter((item) => item.id !== id),
      })),
    updateSettings: (settings) =>
      mutate('update_settings', settings, (current) => {
        const nextHasKey = settings.clearGeminiKey
          ? false
          : settings.geminiApiKey
            ? true
            : current.hasGeminiKey
        return {
          ...current,
          targets: { calories: settings.calories, protein: settings.protein },
          heightIn: settings.heightIn,
          goals: {
            weightLb: settings.goalWeightLb === '' || settings.goalWeightLb == null
              ? null
              : Number(settings.goalWeightLb),
            rateLbWeek: Number(settings.goalRateLbWeek),
            mode: settings.goalMode,
          },
          hasGeminiKey: nextHasKey,
        }
      }),
    applyAdjustment: (calories, reason) =>
      mutate('apply_adjustment', { calories, reason }, (current) => ({
        ...current,
        targets: { ...current.targets, calories },
        adjustments: [
          ...current.adjustments,
          { date: new Date().toISOString().slice(0, 10), calories, reason },
        ],
      })),
    analyze: async () => {
      setSync('syncing', 'Analyzing with Gemini…')
      try {
        const result = await ledgerApi.mutate(passphraseRef.current, 'analyze')
        setSync('success', 'Analysis ready')
        return result
      } catch (error) {
        if (error.code === 'UNAUTHORIZED') {
          setSync('error', 'Sync unauthorized — unlock again')
        } else {
          setSync('error', error.message)
        }
        throw error
      }
    },
    reset: async () => {
      const reset = normalizeLedger(await ledgerApi.mutate(passphraseRef.current, 'reset'))
      commitLedger(reset)
      setPendingImport(null)
      setSync('success', 'Ledger reset')
    },
  }), [commitLedger, mutate, setSync])

  const value = {
    ledger,
    authState,
    syncState,
    pendingImport,
    unlock,
    lock,
    importLocal,
    dismissImport,
    actions,
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger() {
  const context = useContext(LedgerContext)
  if (!context) throw new Error('useLedger must be used inside LedgerProvider')
  return context
}

