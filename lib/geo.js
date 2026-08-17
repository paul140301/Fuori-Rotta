// Condiviso tra le function serverless (stessa formula usata nel client).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// De-dup key coerente con quello usato lato client in precedenza.
function keyFor(p) {
  const lat = Math.round(p.lat * 2000) / 2000;
  const lng = Math.round(p.lng * 2000) / 2000;
  return `${lat},${lng},${(p.name || "").trim().toLowerCase()}`;
}

module.exports = { haversineKm, keyFor };
