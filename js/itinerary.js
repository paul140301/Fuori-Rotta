// Pianificazione itinerario: dato un punto di partenza e un set di luoghi
// selezionati, calcola un ordine di visita "greedy nearest-neighbor" e i
// tempi stimati (viaggio + sosta). Non usa un motore di routing stradale
// reale (nessuna chiave API richiesta): la stima di viaggio è basata sulla
// distanza in linea d'aria corretta con un fattore di tortuosità stradale.

function planRoute(startLat, startLng, places, speedKmh) {
  const remaining = [...places];
  const legs = [];
  let curLat = startLat,
    curLng = startLng;
  let totalTravelMin = 0;
  let totalVisitMin = 0;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(curLat, curLng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const place = remaining.splice(bestIdx, 1)[0];
    const travelMin = estimateTravelMinutes(bestDist, speedKmh);
    const visitMin = place.visitMinutes || CATEGORIES[place.category]?.minutes || 60;
    totalTravelMin += travelMin;
    totalVisitMin += visitMin;
    legs.push({
      place,
      distanceKm: bestDist,
      travelMin,
      visitMin,
      arrivalMin: totalTravelMin + totalVisitMin - visitMin
    });
    curLat = place.lat;
    curLng = place.lng;
  }

  return {
    legs,
    totalTravelMin,
    totalVisitMin,
    totalMin: totalTravelMin + totalVisitMin
  };
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m} min`;
  return `${h} h ${m > 0 ? m + " min" : ""}`.trim();
}

// Suggerisce luoghi non ancora visitati entro un raggio, ordinati per
// distanza da un punto ancora (posizione attuale o ultimo luogo scelto).
function suggestNearby(allPlaces, anchorLat, anchorLng, radiusKm, excludeIds) {
  return allPlaces
    .filter((p) => !excludeIds.has(p.id))
    .map((p) => ({ place: p, distanceKm: haversineKm(anchorLat, anchorLng, p.lat, p.lng) }))
    .filter((x) => x.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Costruisce un link Google Maps con tappe multiple, per navigare con
// l'app di navigazione reale una volta deciso l'ordine di visita.
function googleMapsDirectionsUrl(startLat, startLng, legs) {
  const dest = legs[legs.length - 1].place;
  const waypoints = legs
    .slice(0, -1)
    .map((l) => `${l.place.lat},${l.place.lng}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: `${startLat},${startLng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving"
  });
  let url = `https://www.google.com/maps/dir/?${params.toString()}`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
}
