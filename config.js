// Public client config (anon key is safe with RLS; tables deny anon).
window.LEDGER_CONFIG = {
  supabaseUrl: 'https://wfvwciawsbsekkypzzwd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdndjaWF3c2JzZWtreXB6endkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODEyOTYsImV4cCI6MjEwMTU1NzI5Nn0.tHBgERAkx2-xGOEGkuj3wd3Iw40oHS_G0G-QKCYxkps',
  // Same-origin Netlify proxy (see netlify.toml). Avoids CORS preflight failures.
  apiPath: '/api/ledger'
};
