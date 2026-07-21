import { getStore } from '@netlify/blobs';

const BLOB_KEY = 'physique-data';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Ledger-Passphrase',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function checkPassphrase(req) {
  const expected = process.env.LEDGER_PASSPHRASE;
  if (!expected) {
    return json(500, { error: 'LEDGER_PASSPHRASE is not configured' });
  }
  const provided = req.headers.get('X-Ledger-Passphrase') || '';
  if (provided !== expected) {
    return json(401, { error: 'Unauthorized' });
  }
  return null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  const authError = checkPassphrase(req);
  if (authError) return authError;

  const store = getStore('ledger');

  if (req.method === 'GET') {
    const data = await store.get(BLOB_KEY, { type: 'json' });
    return json(200, data || {
      dailyLogs: [],
      measurements: [],
      workouts: [],
      targets: { calories: 2600, protein: 200 },
      adjustments: [],
    });
  }

  if (req.method === 'PUT') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }
    await store.setJSON(BLOB_KEY, body);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
};
