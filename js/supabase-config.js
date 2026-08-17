// Valori da Supabase → Project Settings → API del TUO progetto personale
// (quello creato seguendo fuori-rotta-cloud/DEPLOY.md — non l'ambiente
// aziendale). L'anon key è pensata per stare nel client: la sicurezza vera
// la fa la Row Level Security attivata in supabase/schema.sql.

const SUPABASE_URL = "https://xrltnjlitxmgvhffritz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhybHRuamxpdHhtZ3ZoZmZyaXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTY4MTMsImV4cCI6MjEwMjE5MjgxM30.oqZnfWN94c_NH61bRiWymrQMX5BYt5JKSMfBSX7Nky0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
