// Storage layer — versione Supabase.
//
// Stessa interfaccia sincrona di prima per la lettura (DB.all()/DB.get())
// grazie a una cache in memoria, così radar/mappa/liste/itinerario restano
// invariati. Le scritture (upsert/remove/bulkImport) sono invece asincrone
// e vanno "await"-ate da chi le chiama, perché parlano davvero con Supabase.
//
// Richiede: aver eseguito supabase/schema.sql sul tuo progetto e aver
// compilato js/supabase-config.js con URL/anon key veri, e un utente loggato
// (vedi js/auth.js) — le Row Level Security policy rifiutano scritture senza
// sessione valida.

let _cache = [];

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    category: row.category || "other",
    accessibility: row.accessibility || "unknown",
    source: row.source || "manual",
    notes: row.notes || "",
    tags: row.tags || [],
    visited: !!row.visited,
    visitCount: row.visit_count || 0,
    lastVisited: row.last_visited ? new Date(row.last_visited).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null
  };
}

function toRow(place) {
  return {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.category || "other",
    accessibility: place.accessibility || "unknown",
    source: place.source || "manual",
    notes: place.notes || "",
    tags: place.tags || [],
    visited: !!place.visited,
    visit_count: place.visitCount || 0,
    last_visited: place.lastVisited ? new Date(place.lastVisited).toISOString() : null
  };
}

// De-dup key: stessa idea di prima (coordinate arrotondate + nome), usata
// dagli import di massa per non duplicare luoghi già presenti.
function keyFor(p) {
  const lat = Math.round(p.lat * 2000) / 2000;
  const lng = Math.round(p.lng * 2000) / 2000;
  return `${lat},${lng},${(p.name || "").trim().toLowerCase()}`;
}

const DB = {
  // Va chiamato una volta, dopo il login, prima di usare il resto dell'app.
  async init() {
    const { data, error } = await sb.from("places").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    _cache = (data || []).map(fromRow);
    return _cache;
  },

  all() {
    return _cache;
  },

  get(id) {
    return _cache.find((p) => p.id === id) || null;
  },

  async upsert(place) {
    const row = toRow(place);
    if (place.id) {
      const { data, error } = await sb.from("places").update(row).eq("id", place.id).select().single();
      if (error) throw error;
      const updated = fromRow(data);
      const idx = _cache.findIndex((p) => p.id === place.id);
      if (idx >= 0) _cache[idx] = updated;
      else _cache.unshift(updated);
      return updated;
    } else {
      const { data: userData, error: userErr } = await sb.auth.getUser();
      if (userErr || !userData?.user) throw new Error("Devi accedere prima di salvare un luogo.");
      const { data, error } = await sb
        .from("places")
        .insert({ ...row, user_id: userData.user.id })
        .select()
        .single();
      if (error) throw error;
      const created = fromRow(data);
      _cache.unshift(created);
      return created;
    }
  },

  async remove(id) {
    const { error } = await sb.from("places").delete().eq("id", id);
    if (error) throw error;
    _cache = _cache.filter((p) => p.id !== id);
  },

  async bulkImport(newPlaces) {
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) throw new Error("Devi accedere prima di importare.");
    const userId = userData.user.id;

    const existingKeys = new Set(_cache.map(keyFor));
    const toInsert = [];
    for (const np of newPlaces) {
      const key = keyFor(np);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toInsert.push({ ...toRow(np), user_id: userId });
    }
    if (!toInsert.length) return { added: 0, skipped: newPlaces.length };

    const { data, error } = await sb.from("places").insert(toInsert).select();
    if (error) throw error;
    const created = data.map(fromRow);
    _cache.unshift(...created);
    return { added: created.length, skipped: newPlaces.length - created.length };
  },

  async markVisited(id) {
    const p = this.get(id);
    if (!p) return;
    await this.upsert({
      ...p,
      visited: true,
      visitCount: (p.visitCount || 0) + 1,
      lastVisited: Date.now()
    });
  },

  // Backup locale: resta comodo anche con Supabase (copia offline, o per
  // spostare dati tra due account diversi).
  exportJSON() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), places: _cache }, null, 2);
  },

  async importJSON(text) {
    const data = JSON.parse(text);
    const places = Array.isArray(data) ? data : data.places || [];
    return this.bulkImport(places);
  }
};

// Impostazioni: restano locali al device (raggio radar, velocità media,
// notifiche foreground) — non c'è ancora sync multi-device per queste,
// il grosso del valore era per i luoghi.
const DB_SETTINGS_KEY = "fr_settings_v1";
const DEFAULT_SETTINGS = {
  radiusKm: 10,
  notifyEnabled: false,
  travelSpeedKmh: 45,
  homeLat: null,
  homeLng: null
};

const Settings = {
  get() {
    try {
      const raw = localStorage.getItem(DB_SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  },
  save(patch) {
    const next = { ...this.get(), ...patch };
    localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }
};
