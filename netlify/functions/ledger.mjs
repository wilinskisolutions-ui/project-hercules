const UPSTREAM =
  'https://wfvwciawsbsekkypzzwd.supabase.co/functions/v1/ledger'

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    body,
    headers: { ...noStoreHeaders, ...headers },
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return response(200, 'ok', {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-ledger-passphrase',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
  }

  const headers = new Headers()
  for (const name of [
    'x-ledger-passphrase',
    'authorization',
    'apikey',
    'content-type',
  ]) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : await request.text(),
      cache: 'no-store',
    })
    return response(upstream.status, await upstream.text(), {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    })
  } catch (error) {
    console.error('ledger proxy error', error)
    return response(
      502,
      JSON.stringify({
        error: 'Ledger service is temporarily unavailable.',
        code: 'UPSTREAM_UNAVAILABLE',
      }),
      { 'Content-Type': 'application/json' },
    )
  }
}

export const config = { path: '/api/ledger' }

