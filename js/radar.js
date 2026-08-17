// Vista "radar": elemento distintivo dell'app. Traccia mostra le distanze,
// i luoghi vicini vengono posizionati come blip in base a rotta (bearing) e
// distanza dal dispositivo. Nord in alto, fisso (nessun accesso alla
// bussola richiesto).

const RADAR_SIZE = 320;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_MAX_R = RADAR_CENTER - 28;

function renderRadar(container, position, places, radiusKm, onSelectPlace) {
  const rings = [0.25, 0.5, 0.75, 1].map((f) => f * radiusKm);

  let blips = "";
  let labels = "";
  const inRange = [];

  if (position) {
    for (const p of places) {
      const d = haversineKm(position.lat, position.lng, p.lat, p.lng);
      if (d > radiusKm * 1.15) continue;
      const clampedD = Math.min(d, radiusKm);
      const r = (clampedD / radiusKm) * RADAR_MAX_R;
      const brg = bearingDeg(position.lat, position.lng, p.lat, p.lng);
      const rad = (brg - 90) * (Math.PI / 180); // -90: 0° (nord) punta in su
      const x = RADAR_CENTER + r * Math.cos(rad);
      const y = RADAR_CENTER + r * Math.sin(rad);
      const cat = CATEGORIES[p.category] || CATEGORIES.other;
      const beyond = d > radiusKm;
      blips += `<circle class="radar-blip${beyond ? " radar-blip-edge" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(
        1
      )}" r="6" fill="${cat.color}" data-id="${p.id}"></circle>`;
      inRange.push({ place: p, distanceKm: d });
    }
  }

  rings.forEach((km, i) => {
    const r = ((i + 1) / rings.length) * RADAR_MAX_R;
    labels += `<text x="${RADAR_CENTER + 4}" y="${RADAR_CENTER - r + 12}" class="radar-ring-label">${km.toFixed(
      1
    )} km</text>`;
  });

  const ringCircles = rings
    .map((_, i) => {
      const r = ((i + 1) / rings.length) * RADAR_MAX_R;
      return `<circle cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="${r}" class="radar-ring"></circle>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${RADAR_SIZE} ${RADAR_SIZE}" class="radar-svg" role="img" aria-label="Radar luoghi vicini">
      <g class="radar-sweep-group">
        <path d="M ${RADAR_CENTER} ${RADAR_CENTER} L ${RADAR_CENTER} ${RADAR_CENTER - RADAR_MAX_R} A ${RADAR_MAX_R} ${RADAR_MAX_R} 0 0 1 ${(
    RADAR_CENTER + RADAR_MAX_R * Math.sin((60 * Math.PI) / 180)
  ).toFixed(1)} ${(RADAR_CENTER - RADAR_MAX_R * Math.cos((60 * Math.PI) / 180)).toFixed(1)} Z" class="radar-sweep"></path>
      </g>
      ${ringCircles}
      <line x1="${RADAR_CENTER}" y1="${RADAR_CENTER - RADAR_MAX_R}" x2="${RADAR_CENTER}" y2="${RADAR_CENTER + RADAR_MAX_R}" class="radar-axis"></line>
      <line x1="${RADAR_CENTER - RADAR_MAX_R}" y1="${RADAR_CENTER}" x2="${RADAR_CENTER + RADAR_MAX_R}" y2="${RADAR_CENTER}" class="radar-axis"></line>
      ${labels}
      <text x="${RADAR_CENTER}" y="16" class="radar-n">N</text>
      ${blips}
      <circle cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="7" class="radar-me"></circle>
    </svg>
  `;

  container.querySelectorAll(".radar-blip").forEach((el) => {
    el.addEventListener("click", () => onSelectPlace && onSelectPlace(el.dataset.id));
  });

  return inRange.sort((a, b) => a.distanceKm - b.distanceKm);
}
