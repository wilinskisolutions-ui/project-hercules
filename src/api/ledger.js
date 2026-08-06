const PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdndjaWF3c2JzZWtreXB6endkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODEyOTYsImV4cCI6MjEwMTU1NzI5Nn0.tHBgERAkx2-xGOEGkuj3wd3Iw40oHS_G0G-QKCYxkps'

export function resolveApiUrl() {
  return '/api/ledger'
}

export class LedgerError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', cause } = {}) {
    super(message, { cause })
    this.name = 'LedgerError'
    this.status = status
    this.code = code
  }
}

export async function requestLedger(passphrase, body, options = {}) {
  const method = body ? 'POST' : 'GET'
  let response
  try {
    response = await fetch(options.url || resolveApiUrl(), {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Ledger-Passphrase': passphrase,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        apikey: PUBLISHABLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options.signal,
    })
  } catch (cause) {
    throw new LedgerError('Could not reach the ledger service.', {
      code: 'NETWORK_ERROR',
      cause,
    })
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // The proxy may return plain text for infrastructure errors.
  }

  if (!response.ok) {
    const code = payload?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'API_ERROR')
    const message =
      response.status === 401
        ? 'Wrong passphrase'
        : payload?.error || `Ledger request failed (${response.status})`
    throw new LedgerError(message, { status: response.status, code })
  }

  return payload
}

export const ledgerApi = {
  bootstrap: (passphrase, options) => requestLedger(passphrase, null, options),
  mutate: (passphrase, op, payload = {}, options) =>
    requestLedger(passphrase, { op, ...payload }, options),
}

