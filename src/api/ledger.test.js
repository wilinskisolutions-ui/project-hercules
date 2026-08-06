import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedgerError, requestLedger, resolveApiUrl } from './ledger'

afterEach(() => vi.restoreAllMocks())

describe('ledger API client', () => {
  it('uses the same-origin proxy in every browser environment', () => {
    expect(resolveApiUrl('hercules0.netlify.app')).toBe('/api/ledger')
    expect(resolveApiUrl('localhost')).toBe('/api/ledger')
  })

  it('sends passphrase and no-store headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ empty: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await requestLedger('EMIL', null, { url: '/api/ledger' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ledger',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({ 'X-Ledger-Passphrase': 'EMIL' }),
      }),
    )
  })

  it('normalizes 401 into an unauthorized LedgerError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(requestLedger('wrong', null, { url: '/api/ledger' })).rejects.toEqual(
      expect.objectContaining({
        name: 'LedgerError',
        code: 'UNAUTHORIZED',
        status: 401,
      }),
    )
  })

  it('turns network failures into a stable client error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(requestLedger('EMIL', null, { url: '/api/ledger' })).rejects.toBeInstanceOf(
      LedgerError,
    )
  })
})

