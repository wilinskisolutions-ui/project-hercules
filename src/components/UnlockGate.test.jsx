import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedgerProvider } from '../state/LedgerContext'
import { UnlockGate } from './UnlockGate'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('UnlockGate', () => {
  it('trims and submits the passphrase', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          dailyLogs: [],
          measurements: [],
          workouts: [],
          targets: { calories: 2600, protein: 200 },
          adjustments: [],
          heightIn: 75,
          empty: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(
      <LedgerProvider>
        <UnlockGate />
      </LedgerProvider>,
    )
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: '  EMIL  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open ledger' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][1].headers['X-Ledger-Passphrase']).toBe('EMIL')
    expect(sessionStorage.getItem('ledger-passphrase')).toBe('EMIL')
  })

  it('shows wrong-passphrase feedback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(
      <LedgerProvider>
        <UnlockGate />
      </LedgerProvider>,
    )
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open ledger' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong passphrase')
  })
})

