import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './ledger.mjs'

afterEach(() => vi.restoreAllMocks())

describe('Netlify ledger proxy', () => {
  it('answers OPTIONS locally without calling upstream', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await handler(new Request('https://site.test/api/ledger', { method: 'OPTIONS' }))
    expect(response.statusCode).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards auth headers and disables caching', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ empty: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const response = await handler(
      new Request('https://site.test/api/ledger', {
        headers: {
          'X-Ledger-Passphrase': 'EMIL',
          Authorization: 'Bearer public',
          apikey: 'public',
        },
      }),
    )
    const upstreamOptions = fetchMock.mock.calls[0][1]
    expect(upstreamOptions.headers.get('x-ledger-passphrase')).toBe('EMIL')
    expect(response.headers['Cache-Control']).toContain('no-store')
    expect(response.statusCode).toBe(200)
  })
})

