// Distanza in km tra due coordinate (formula di Haversine).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Rotta (bearing) in gradi da punto 1 a punto 2, 0° = nord, oraria.
function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Stima tempo di viaggio (minuti) su strada: distanza in linea d'aria
// corretta con un fattore di tortuosità stradale, diviso la velocità media.
function estimateTravelMinutes(distanceKm, speedKmh) {
  const roadFactor = 1.3;
  const roadKm = distanceKm * roadFactor;
  return Math.round((roadKm / speedKmh) * 60);
}

const GeoWatcher = {
  watchId: null,
  lastPosition: null,
  listeners: [],

  onUpdate(fn) {
    this.listeners.push(fn);
  },

  start() {
    if (!("geolocation" in navigator)) return Promise.reject(new Error("Geolocalizzazione non disponibile"));
    return new Promise((resolve, reject) => {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          this.listeners.forEach((fn) => fn(this.lastPosition));
          resolve(this.lastPosition);
        },
        (err) => reject(err),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
    });
  },

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  },

  once() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Geolocalizzazione non disponibile"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        reject,
        { enableHighAccuracy: true, timeout: 20000 }
      );
    });
  }
};

// Tiene traccia dei luoghi già notificati in questa sessione per non
// spammare la stessa notifica ad ogni aggiornamento di posizione.
const NotifiedSet = new Set();

function maybeNotifyNearby(places, position, radiusKm) {
  if (!("Notification" in window) || Notification.permission !== "granted") return [];
  const inRange = [];
  for (const p of places) {
    const d = haversineKm(position.lat, position.lng, p.lat, p.lng);
    if (d <= radiusKm) {
      inRange.push({ place: p, distanceKm: d });
      if (!NotifiedSet.has(p.id)) {
        NotifiedSet.add(p.id);
        try {
          new Notification("Luogo abbandonato nei paraggi", {
            body: `${p.name} — a ${d.toFixed(1)} km (${CATEGORIES[p.category]?.label || "N/D"})`,
            tag: p.id,
            icon: "icons/icon-192.png"
          });
        } catch (e) {
          // Notification API può non essere disponibile in alcuni contesti (es. iOS Safari fuori da PWA installata)
        }
      }
    } else {
      NotifiedSet.delete(p.id);
    }
  }
  return inRange.sort((a, b) => a.distanceKm - b.distanceKm);
}
