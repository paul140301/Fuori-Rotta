// POST /api/import-takeout
// Header: Authorization: Bearer <supabase access token dell'utente loggato>
// Body: { rows: [{ name, url, note }] }   — righe già estratte dal CSV di
//       Takeout "Saved" lato client (il parsing CSV resta in js/importer.js,
//       qui arriva solo l'array già pulito).
// Risposta: { imported, skipped, unresolved: [nomi senza coordinate] }
//
// Perché serve una function e non si fa tutto nel browser: gli URL del CSV
// di Takeout per le liste personalizzate sono spesso link "corti" senza
// coordinate incorporate, e risolverli richiede di seguire un redirect
// verso maps.google.com — il browser lo blocca per CORS, un server no.

const { resolveOne } = require("../lib/resolve");
const { supabaseForRequest } = require("../lib/supabase");
const { keyFor } = require("../lib/geo");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo non consentito" });

  const supabase = supabaseForRequest(req);
  if (!supabase) return res.status(401).json({ error: "Manca l'header Authorization" });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sessione non valida" });
  const userId = userData.user.id;

  const { rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: "'rows' deve essere un array non vuoto" });
  }
  if (rows.length > 150) {
    return res.status(400).json({ error: "Troppe righe in un colpo solo (max 150 — il piano Hobby di Vercel taglia le function a 10s: dividi il CSV in blocchi da 40-50 righe lato client)" });
  }

  // Risolve gli URL in parallelo (con un limite di concorrenza semplice per
  // non bombardare Google con centinaia di richieste simultanee).
  const resolved = [];
  const BATCH = 15;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const partial = await Promise.all(
      slice.map(async (r) => {
        if (!r.url) return { ...r, lat: null, lng: null };
        const out = await resolveOne(r.url);
        return { ...r, lat: out.lat, lng: out.lng };
      })
    );
    resolved.push(...partial);
  }

  const withCoords = resolved.filter((r) => r.lat != null && r.lng != null);
  const unresolved = resolved.filter((r) => r.lat == null || r.lng == null).map((r) => r.name || "(senza nome)");

  // Dedup contro quello che l'utente ha già in tabella.
  const { data: existing, error: existErr } = await supabase.from("places").select("name, lat, lng").eq("user_id", userId);
  if (existErr) return res.status(500).json({ error: existErr.message });

  const existingKeys = new Set((existing || []).map(keyFor));
  const toInsert = [];
  for (const r of withCoords) {
    const candidate = { name: r.name || "Senza nome", lat: r.lat, lng: r.lng };
    const key = keyFor(candidate);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    toInsert.push({
      user_id: userId,
      name: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
      notes: r.note || "",
      source: "google",
      category: "other",
      accessibility: "unknown"
    });
  }

  let imported = 0;
  if (toInsert.length) {
    const { data, error } = await supabase.from("places").insert(toInsert).select("id");
    if (error) return res.status(500).json({ error: error.message });
    imported = data.length;
  }

  res.status(200).json({
    imported,
    skipped: withCoords.length - imported,
    unresolved
  });
};
