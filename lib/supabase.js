const { createClient } = require("@supabase/supabase-js");

// Client "per utente": passa il JWT dell'utente loggato così le Row Level
// Security policy di Supabase si applicano automaticamente (nessun bisogno
// di una service role key per le normali operazioni CRUD dell'app).
function supabaseForRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
}

module.exports = { supabaseForRequest };
