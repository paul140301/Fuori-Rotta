// Wrapper sottile su Leaflet + tile OpenStreetMap (nessuna chiave API
// richiesta). I tile vengono anche messi in cache runtime dal service worker
// così le zone già visualizzate restano disponibili offline.

const MapView = {
  map: null,
  markers: new Map(),
  meMarker: null,
  draftMarker: null,
  _press: null,

  init(containerId, center) {
    this.map = L.map(containerId, { zoomControl: true }).setView(center, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(this.map);
    return this.map;
  },

  // Tenere premuto un punto vuoto della mappa (o click destro su desktop)
  // apre il form di aggiunta luogo con le coordinate già compilate.
  // Leaflet normalizza touch e mouse sugli stessi eventi "mousedown" ecc.,
  // quindi la stessa logica copre telefono e desktop.
  enableLongPressAdd(onLongPress) {
    const LONG_PRESS_MS = 550;
    const MOVE_TOLERANCE_PX = 12;

    const clearTimer = () => {
      if (this._press?.timer) clearTimeout(this._press.timer);
      this._press = null;
    };

    this.map.on("mousedown", (e) => {
      clearTimer();
      this._press = { startPoint: e.containerPoint, latlng: e.latlng };
      this._press.timer = setTimeout(() => {
        this._press = null;
        onLongPress(e.latlng);
      }, LONG_PRESS_MS);
    });

    this.map.on("mousemove", (e) => {
      if (this._press && e.containerPoint.distanceTo(this._press.startPoint) > MOVE_TOLERANCE_PX) {
        clearTimer();
      }
    });

    this.map.on("mouseup dragstart zoomstart", clearTimer);

    // Click destro su desktop: stessa scorciatoia, istantanea.
    this.map.on("contextmenu", (e) => {
      L.DomEvent.preventDefault(e.originalEvent);
      clearTimer();
      onLongPress(e.latlng);
    });
  },

  showDraftMarker(lat, lng) {
    this.clearDraftMarker();
    const icon = L.divIcon({
      className: "map-draft",
      html: `<span class="map-draft-dot"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    this.draftMarker = L.marker([lat, lng], { icon, zIndexOffset: 900 }).addTo(this.map);
  },

  clearDraftMarker() {
    if (this.draftMarker) {
      this.map.removeLayer(this.draftMarker);
      this.draftMarker = null;
    }
  },

  clearMarkers() {
    this.markers.forEach((m) => this.map.removeLayer(m));
    this.markers.clear();
  },

  renderPlaces(places, onClick) {
    this.clearMarkers();
    for (const p of places) {
      const cat = CATEGORIES[p.category] || CATEGORIES.other;
      const icon = L.divIcon({
        className: "map-pin",
        html: `<span class="map-pin-dot" style="background:${cat.color}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(this.map);
      marker.bindPopup(this.popupHTML(p));
      marker.on("click", () => onClick && onClick(p.id));
      this.markers.set(p.id, marker);
    }
  },

  popupHTML(p) {
    const cat = CATEGORIES[p.category] || CATEGORIES.other;
    const acc = ACCESS_LEVELS[p.accessibility] || ACCESS_LEVELS.unknown;
    return `<div class="map-popup">
      <strong>${escapeHTML(p.name)}</strong><br/>
      <span style="color:${cat.color}">${cat.label}</span> ·
      <span style="color:${acc.color}">${acc.label}</span><br/>
      ${p.visited ? `Visitato ${p.visitCount}×` : "Mai visitato"}
    </div>`;
  },

  setMe(lat, lng) {
    if (this.meMarker) this.map.removeLayer(this.meMarker);
    const icon = L.divIcon({ className: "map-me", html: `<span class="map-me-dot"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    this.meMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(this.map);
  },

  flyTo(lat, lng, zoom) {
    this.map.flyTo([lat, lng], zoom || 14);
  }
};

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
