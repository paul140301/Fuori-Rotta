// Punto di ingresso: collega dati (db.js), geolocalizzazione (geo.js),
// mappa (map.js), radar (radar.js) e pianificatore (itinerary.js) alla UI.

const DEFAULT_CENTER = [45.671, 11.918]; // fallback prima di avere un fix GPS
const ITIN_SUGGEST_RADIUS_KM = 30;

let currentPosition = null;
let mapInitialized = false;
let editingPlaceId = null;
let itinSelectedIds = new Set();

// ---------- Utility UI ----------

function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

function fillSelect(select, items, { placeholder } = {}) {
  select.innerHTML = "";
  if (placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    select.appendChild(opt);
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
}

function timeAgo(ts) {
  if (!ts) return "";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mesi fa`;
  return `${Math.floor(months / 12)} anni fa`;
}

// ---------- View switching ----------

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== viewId));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));

  if (viewId === "view-map") {
    if (!mapInitialized) {
      const center = currentPosition ? [currentPosition.lat, currentPosition.lng] : DEFAULT_CENTER;
      MapView.init("mapEl", center);
      mapInitialized = true;
      renderMapMarkers();
      if (currentPosition) MapView.setMe(currentPosition.lat, currentPosition.lng);
      MapView.enableLongPressAdd((latlng) => {
        MapView.showDraftMarker(latlng.lat, latlng.lng);
        openPlaceModal(null, { lat: latlng.lat, lng: latlng.lng });
      });
    }
    setTimeout(() => MapView.map && MapView.map.invalidateSize(), 80);
  }
  if (viewId === "view-places") renderPlacesList();
  if (viewId === "view-itinerary") renderItinCandidates();
}

// ---------- Radar + Nearby ----------

function renderRadarAndNearby() {
  const settings = Settings.get();
  const places = DB.all();
  const container = document.getElementById("radarContainer");
  const inRange = renderRadar(container, currentPosition, places, settings.radiusKm, (id) => openPlaceModal(id));

  const list = document.getElementById("nearbyList");
  if (!currentPosition) {
    list.innerHTML = `<li class="empty-hint">In attesa del GPS per calcolare le distanze…</li>`;
    return;
  }
  if (!inRange.length) {
    list.innerHTML = `<li class="empty-hint">Nessun luogo salvato entro ${settings.radiusKm} km. Aggiungine uno con "+".</li>`;
    return;
  }
  list.innerHTML = inRange
    .map(({ place, distanceKm }) => {
      const cat = CATEGORIES[place.category] || CATEGORIES.other;
      return `<li class="nearby-item" data-id="${place.id}">
        <span class="nearby-dot" style="background:${cat.color}"></span>
        <div class="nearby-main">
          <strong>${escapeHTML(place.name)}</strong>
          <span class="nearby-meta">${cat.label}${place.visited ? " · visitato" : ""}</span>
        </div>
        <span class="nearby-dist">${distanceKm.toFixed(1)} km</span>
      </li>`;
    })
    .join("");
  list.querySelectorAll(".nearby-item").forEach((el) => {
    el.addEventListener("click", () => openPlaceModal(el.dataset.id));
  });
}

function checkNotifications() {
  const settings = Settings.get();
  if (!settings.notifyEnabled || !currentPosition) return;
  maybeNotifyNearby(DB.all(), currentPosition, settings.radiusKm);
}

// ---------- Places list ----------

function renderPlacesList() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const catFilter = document.getElementById("filterCategory").value;
  const statusFilter = document.getElementById("filterStatus").value;

  let places = DB.all();
  if (search) {
    places = places.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        (p.notes || "").toLowerCase().includes(search) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(search))
    );
  }
  if (catFilter) places = places.filter((p) => p.category === catFilter);
  if (statusFilter === "visited") places = places.filter((p) => p.visited);
  if (statusFilter === "unvisited") places = places.filter((p) => !p.visited);

  if (currentPosition) {
    places.forEach((p) => (p._d = haversineKm(currentPosition.lat, currentPosition.lng, p.lat, p.lng)));
    places.sort((a, b) => a._d - b._d);
  } else {
    places.sort((a, b) => a.name.localeCompare(b.name));
  }

  document.getElementById("placesCount").textContent = `${places.length} luogo${places.length === 1 ? "" : "i"}`;

  const list = document.getElementById("placesList");
  if (!places.length) {
    list.innerHTML = `<li class="empty-hint">Nessun luogo trovato. Aggiungine uno o importa una lista dalle Impostazioni.</li>`;
    return;
  }

  list.innerHTML = places
    .map((p) => {
      const cat = CATEGORIES[p.category] || CATEGORIES.other;
      const acc = ACCESS_LEVELS[p.accessibility] || ACCESS_LEVELS.unknown;
      return `<li class="place-card" data-id="${p.id}">
        <div class="place-card-top">
          <strong>${escapeHTML(p.name)}</strong>
          <span class="badge" style="background:${cat.color}33;color:${cat.color}">${cat.label}</span>
        </div>
        ${p.notes ? `<p class="place-notes">${escapeHTML(p.notes)}</p>` : ""}
        <div class="place-card-meta">
          <span style="color:${acc.color}">${acc.label}</span>
          <span>${p.visited ? `Visitato ${p.visitCount}×${p.lastVisited ? " · " + timeAgo(p.lastVisited) : ""}` : "Da visitare"}</span>
          ${p._d !== undefined ? `<span>${p._d.toFixed(1)} km</span>` : ""}
        </div>
      </li>`;
    })
    .join("");

  list.querySelectorAll(".place-card").forEach((el) => {
    el.addEventListener("click", () => openPlaceModal(el.dataset.id));
  });
}

function renderMapMarkers() {
  if (!mapInitialized) return;
  MapView.renderPlaces(DB.all(), (id) => openPlaceModal(id));
}

// ---------- Itinerary ----------

function renderItinCandidates() {
  const places = DB.all();
  if (currentPosition) {
    places.forEach((p) => (p._d = haversineKm(currentPosition.lat, currentPosition.lng, p.lat, p.lng)));
    places.sort((a, b) => (a.visited === b.visited ? a._d - b._d : a.visited ? 1 : -1));
  }
  const list = document.getElementById("itinCandidates");
  if (!places.length) {
    list.innerHTML = `<li class="empty-hint">Aggiungi qualche luogo prima di pianificare un'uscita.</li>`;
    return;
  }
  list.innerHTML = places
    .map((p) => {
      const cat = CATEGORIES[p.category] || CATEGORIES.other;
      const checked = itinSelectedIds.has(p.id) ? "checked" : "";
      return `<li class="itin-cand">
        <input type="checkbox" id="itc_${p.id}" data-id="${p.id}" ${checked} />
        <label for="itc_${p.id}">
          ${escapeHTML(p.name)}
          <span class="m" style="color:${cat.color}">${cat.label}${p._d !== undefined ? " · " + p._d.toFixed(1) + " km" : ""}${p.visited ? " · visitato" : ""}</span>
        </label>
      </li>`;
    })
    .join("");
  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) itinSelectedIds.add(cb.dataset.id);
      else itinSelectedIds.delete(cb.dataset.id);
    });
  });
}

function getAnchorForPlanning() {
  const startMode = document.getElementById("itinStart").value;
  if (startMode === "home") {
    const s = Settings.get();
    if (s.homeLat == null || s.homeLng == null) return null;
    return { lat: s.homeLat, lng: s.homeLng };
  }
  return currentPosition;
}

function handleSuggestNearby() {
  const anchor = getAnchorForPlanning();
  if (!anchor) {
    toast("Imposta prima il GPS o un punto Casa nelle impostazioni.");
    return;
  }
  const excluded = new Set(itinSelectedIds);
  const suggestions = suggestNearby(DB.all(), anchor.lat, anchor.lng, ITIN_SUGGEST_RADIUS_KM, excluded).slice(0, 8);
  if (!suggestions.length) {
    toast(`Nessun altro luogo entro ${ITIN_SUGGEST_RADIUS_KM} km.`);
    return;
  }
  suggestions.forEach((s) => itinSelectedIds.add(s.place.id));
  renderItinCandidates();
  toast(`Aggiunti ${suggestions.length} luoghi suggeriti entro ${ITIN_SUGGEST_RADIUS_KM} km.`);
}

function handleGenerateItinerary() {
  const anchor = getAnchorForPlanning();
  if (!anchor) {
    toast("Imposta prima il GPS o un punto Casa nelle impostazioni.");
    return;
  }
  const places = DB.all().filter((p) => itinSelectedIds.has(p.id));
  if (!places.length) {
    toast("Seleziona almeno una tappa dall'elenco qui sopra.");
    return;
  }
  const speed = parseFloat(document.getElementById("itinSpeed").value) || 45;
  Settings.save({ travelSpeedKmh: speed });

  const result = planRoute(anchor.lat, anchor.lng, places, speed);
  const resultEl = document.getElementById("itinResult");
  resultEl.innerHTML = `
    <div class="itin-summary">
      <div><span class="big">${formatMinutes(result.totalMin)}</span><span class="label">Durata totale</span></div>
      <div><span class="big">${formatMinutes(result.totalTravelMin)}</span><span class="label">In viaggio</span></div>
      <div><span class="big">${result.legs.length}</span><span class="label">Tappe</span></div>
    </div>
    ${result.legs
      .map((leg, i) => {
        const cat = CATEGORIES[leg.place.category] || CATEGORIES.other;
        return `<div class="itin-leg">
          <span class="num">${i + 1}</span>
          <div class="main">
            <strong>${escapeHTML(leg.place.name)}</strong>
            <span>${cat.label} · ${leg.distanceKm.toFixed(1)} km, ~${formatMinutes(leg.travelMin)} di viaggio · sosta ${formatMinutes(leg.visitMin)} · arrivo a +${formatMinutes(leg.arrivalMin)}</span>
          </div>
        </div>`;
      })
      .join("")}
    <a class="btn-primary wide" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box;margin-top:12px"
       href="${googleMapsDirectionsUrl(anchor.lat, anchor.lng, result.legs)}" target="_blank" rel="noopener">
      Apri il percorso in Google Maps
    </a>
  `;
}

// ---------- Place modal ----------

function openPlaceModal(id, prefillCoords) {
  editingPlaceId = id || null;
  const place = id ? DB.get(id) : null;

  document.getElementById("modalPlaceTitle").textContent = place ? "Modifica luogo" : "Nuovo luogo";
  document.getElementById("fName").value = place?.name || "";
  document.getElementById("fLat").value = place?.lat ?? prefillCoords?.lat ?? "";
  document.getElementById("fLng").value = place?.lng ?? prefillCoords?.lng ?? "";
  document.getElementById("fPaste").value = "";
  document.getElementById("fCategory").value = place?.category || "other";
  document.getElementById("fAccess").value = place?.accessibility || "unknown";
  document.getElementById("fSource").value = place?.source || (prefillCoords ? "manual" : "manual");
  document.getElementById("fNotes").value = place?.notes || "";
  document.getElementById("fVisited").checked = !!place?.visited;
  document.getElementById("btnDeletePlace").classList.toggle("hidden", !place);

  openModal("modalPlace");
  if (prefillCoords) document.getElementById("fName").focus();
}

async function savePlaceFromModal() {
  const name = document.getElementById("fName").value.trim();
  const lat = parseFloat(document.getElementById("fLat").value);
  const lng = parseFloat(document.getElementById("fLng").value);
  if (!name) return toast("Dai un nome al luogo.");
  if (isNaN(lat) || isNaN(lng)) return toast("Coordinate mancanti: incollale o usa il GPS.");

  const wasVisited = editingPlaceId ? !!DB.get(editingPlaceId)?.visited : false;
  const nowVisited = document.getElementById("fVisited").checked;

  const place = {
    id: editingPlaceId || undefined,
    name,
    lat,
    lng,
    category: document.getElementById("fCategory").value,
    accessibility: document.getElementById("fAccess").value,
    source: document.getElementById("fSource").value,
    notes: document.getElementById("fNotes").value.trim(),
    visited: nowVisited
  };
  // Se il flag "già stato" passa da false a true da qui, conta come una visita.
  if (nowVisited && !wasVisited) {
    const prev = editingPlaceId ? DB.get(editingPlaceId) : null;
    place.visitCount = (prev?.visitCount || 0) + 1;
    place.lastVisited = Date.now();
  }

  const btn = document.getElementById("btnSavePlace");
  btn.disabled = true;
  try {
    await DB.upsert(place);
    closeModals();
    refreshAllData();
    toast("Salvato su Supabase.");
  } catch (e) {
    console.error(e);
    toast(`Errore nel salvare: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
}

async function deletePlaceFromModal() {
  if (!editingPlaceId) return;
  if (!confirm("Eliminare questo luogo dallo schedario?")) return;
  try {
    await DB.remove(editingPlaceId);
    closeModals();
    refreshAllData();
    toast("Luogo eliminato.");
  } catch (e) {
    console.error(e);
    toast(`Errore nell'eliminare: ${e.message || e}`);
  }
}

// ---------- Settings modal ----------

function openSettingsModal() {
  const s = Settings.get();
  document.getElementById("sNotify").checked = !!s.notifyEnabled;
  document.getElementById("sHomeLat").value = s.homeLat ?? "";
  document.getElementById("sHomeLng").value = s.homeLng ?? "";
  document.getElementById("placesTotalHint").textContent = `${DB.all().length} luoghi salvati sul tuo account, sincronizzati su tutti i device.`;
  syncNotifyChip();
  openModal("modalSettings");
}

function syncNotifyChip() {
  const s = Settings.get();
  const chip = document.getElementById("btnNotifyToggle");
  chip.textContent = s.notifyEnabled ? "🔔 Notifiche attive" : "🔕 Notifiche disattivate";
  chip.classList.toggle("on", !!s.notifyEnabled);
}

async function setNotifyEnabled(want) {
  if (want) {
    if (!("Notification" in window)) {
      toast("Le notifiche non sono supportate su questo browser.");
      return false;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Permesso notifiche negato.");
      return false;
    }
  }
  Settings.save({ notifyEnabled: want });
  syncNotifyChip();
  document.getElementById("sNotify").checked = want;
  return true;
}

// ---------- Modal plumbing ----------

function openModal(id) {
  document.getElementById("modalRoot").classList.remove("hidden");
  document.querySelectorAll(".modal").forEach((m) => m.classList.toggle("hidden", m.id !== id));
}
function closeModals() {
  document.getElementById("modalRoot").classList.add("hidden");
  document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  editingPlaceId = null;
  if (mapInitialized) MapView.clearDraftMarker();
}

// ---------- Import helpers ----------

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

async function handleGoogleImport(file) {
  try {
    const text = await readFileAsText(file);
    const places = parseGoogleTakeoutOrGeoJSON(text, "google");
    const { added, skipped } = await DB.bulkImport(places);
    toast(`Import Google: ${added} aggiunti, ${skipped} già presenti.`);
    refreshAllData();
  } catch (e) {
    console.error(e);
    toast("File non riconosciuto, o errore nel salvare su Supabase.");
  }
}

async function handleGenericImport(file) {
  try {
    const text = await readFileAsText(file);
    let places;
    if (file.name.toLowerCase().endsWith(".csv")) {
      places = parseGenericCSV(text, "import");
    } else {
      places = parseGoogleTakeoutOrGeoJSON(text, "import");
    }
    const { added, skipped } = await DB.bulkImport(places);
    toast(`Import: ${added} aggiunti, ${skipped} già presenti.`);
    refreshAllData();
  } catch (e) {
    console.error(e);
    toast("Formato non riconosciuto, o errore nel salvare su Supabase.");
  }
}

async function handleBackupImport(file) {
  try {
    const text = await readFileAsText(file);
    const { added, skipped } = await DB.importJSON(text);
    toast(`Backup: ${added} aggiunti, ${skipped} già presenti.`);
    refreshAllData();
  } catch (e) {
    console.error(e);
    toast("Backup non valido, o errore nel salvare su Supabase.");
  }
}

function handleExportJSON() {
  const blob = new Blob([DB.exportJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fuori-rotta-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// ---------- Refresh orchestration ----------

function refreshAllData() {
  renderRadarAndNearby();
  renderPlacesList();
  renderMapMarkers();
  renderItinCandidates();
}

// ---------- Init ----------

async function init() {
  fillSelect(document.getElementById("fCategory"), categoryList());
  fillSelect(document.getElementById("fAccess"), accessList());
  fillSelect(document.getElementById("filterCategory"), categoryList(), { placeholder: "Tutte le categorie" });

  const settings = Settings.get();
  document.getElementById("radiusSelect").value = String(settings.radiusKm);
  document.getElementById("itinSpeed").value = settings.travelSpeedKmh;
  syncNotifyChip();

  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("fabAdd").addEventListener("click", () => openPlaceModal(null));
  document.getElementById("btnSettings").addEventListener("click", openSettingsModal);
  document.getElementById("btnSettingsSidebar").addEventListener("click", openSettingsModal);
  document.querySelectorAll(".modal-close").forEach((b) => b.addEventListener("click", closeModals));
  document.querySelector(".modal-backdrop").addEventListener("click", closeModals);

  document.getElementById("btnSavePlace").addEventListener("click", savePlaceFromModal);
  document.getElementById("btnDeletePlace").addEventListener("click", deletePlaceFromModal);

  document.getElementById("fPaste").addEventListener("input", (e) => {
    const coords = parseFreeformCoords(e.target.value);
    if (coords) {
      document.getElementById("fLat").value = coords.lat;
      document.getElementById("fLng").value = coords.lng;
    }
  });
  document.getElementById("btnUseGPS").addEventListener("click", async () => {
    try {
      const pos = currentPosition || (await GeoWatcher.once());
      document.getElementById("fLat").value = pos.lat;
      document.getElementById("fLng").value = pos.lng;
    } catch (e) {
      toast("Impossibile leggere la posizione.");
    }
  });
  document.getElementById("btnOpenMaps").addEventListener("click", () => {
    const lat = parseFloat(document.getElementById("fLat").value);
    const lng = parseFloat(document.getElementById("fLng").value);
    if (isNaN(lat) || isNaN(lng)) return toast("Inserisci prima le coordinate.");
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, "_blank", "noopener");
  });

  document.getElementById("radiusSelect").addEventListener("change", (e) => {
    Settings.save({ radiusKm: parseInt(e.target.value, 10) });
    renderRadarAndNearby();
  });
  document.getElementById("btnNotifyToggle").addEventListener("click", async () => {
    const s = Settings.get();
    await setNotifyEnabled(!s.notifyEnabled);
  });

  document.getElementById("searchInput").addEventListener("input", renderPlacesList);
  document.getElementById("filterCategory").addEventListener("change", renderPlacesList);
  document.getElementById("filterStatus").addEventListener("change", renderPlacesList);

  document.getElementById("itinStart").addEventListener("change", () => {
    itinSelectedIds.clear();
    renderItinCandidates();
    document.getElementById("itinResult").innerHTML = "";
  });
  document.getElementById("btnSuggestNearby").addEventListener("click", handleSuggestNearby);
  document.getElementById("btnGenerateItin").addEventListener("click", handleGenerateItinerary);

  // Settings modal wiring
  document.getElementById("sNotify").addEventListener("change", async (e) => {
    const ok = await setNotifyEnabled(e.target.checked);
    if (!ok) e.target.checked = false;
  });
  document.getElementById("sHomeLat").addEventListener("change", (e) => {
    Settings.save({ homeLat: parseFloat(e.target.value) || null });
  });
  document.getElementById("sHomeLng").addEventListener("change", (e) => {
    Settings.save({ homeLng: parseFloat(e.target.value) || null });
  });
  document.getElementById("btnUseGPSHome").addEventListener("click", async () => {
    try {
      const pos = currentPosition || (await GeoWatcher.once());
      document.getElementById("sHomeLat").value = pos.lat;
      document.getElementById("sHomeLng").value = pos.lng;
      Settings.save({ homeLat: pos.lat, homeLng: pos.lng });
      toast("Punto Casa aggiornato.");
    } catch (e) {
      toast("Impossibile leggere la posizione.");
    }
  });

  document.getElementById("fileGoogleImport").addEventListener("change", (e) => {
    if (e.target.files[0]) handleGoogleImport(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("fileGenericImport").addEventListener("change", (e) => {
    if (e.target.files[0]) handleGenericImport(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("fileBackupImport").addEventListener("change", (e) => {
    if (e.target.files[0]) handleBackupImport(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("btnExportJSON").addEventListener("click", handleExportJSON);
  document.getElementById("btnSignOut").addEventListener("click", signOutAndReload);

  // ---------- Accesso + caricamento dati da Supabase ----------
  initAuthForm();
  await ensureSession();

  currentUserEmail().then((email) => {
    document.getElementById("accountEmailHint").textContent = email ? `Connesso come ${email}` : "—";
  });

  try {
    await DB.init();
  } catch (e) {
    console.error(e);
    toast("Errore nel caricare i luoghi da Supabase. Controlla js/supabase-config.js e lo schema.");
  }

  // Geolocalizzazione
  const statusLine = document.getElementById("statusLine");
  GeoWatcher.onUpdate((pos) => {
    currentPosition = pos;
    statusLine.textContent = `Posizione agganciata · ±${Math.round(pos.accuracy)} m`;
    renderRadarAndNearby();
    checkNotifications();
    if (mapInitialized) MapView.setMe(pos.lat, pos.lng);
  });
  GeoWatcher.start().catch(() => {
    statusLine.textContent = "Posizione non disponibile — controlla i permessi del browser";
  });

  refreshAllData();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch((e) => console.error("SW error", e));
  }
}

document.addEventListener("DOMContentLoaded", init);
