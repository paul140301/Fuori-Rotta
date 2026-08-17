// Percorsi di import supportati:
//
// 1) Google Takeout — GeoJSON della lista "Urbex"
//    takeout.google.com → deseleziona tutto → Maps (Le tue attività) →
//    include solo "Le mie mappe personalizzate" NO: per le Liste salvate serve
//    la sezione "Saved" / "Luoghi salvati" → esporta → arriva un file
//    <NomeLista>.json (FeatureCollection). Questo importer lo riconosce.
// 2) GeoJSON generico (FeatureCollection di Point) — es. esportato da
//    Google My Maps ("Esporta come KML" convertito, o altri strumenti).
// 3) CSV generico con colonne nome/lat/lng (o title/note/url in stile Takeout).
// 4) Incolla singola: un link Google Maps o una coppia "lat, lng" copiata a
//    mano dalla mappa di Urbexology (che non offre un export/API pubblici).

function parseGoogleTakeoutOrGeoJSON(jsonText, sourceLabel) {
  const data = JSON.parse(jsonText);
  const features = data.features || [];
  const places = [];
  for (const f of features) {
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    const props = f.properties || {};
    const loc = props.Location || props.location || {};
    const name = loc.name || props.name || props.Title || props.title || "Senza nome";
    const address = loc.address || props.address || "";
    places.push({
      name,
      lat,
      lng,
      notes: address ? `Indirizzo: ${address}` : "",
      source: sourceLabel || "google",
      category: "other",
      accessibility: "unknown"
    });
  }
  return places;
}

function parseGenericCSV(csvText, sourceLabel) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);

  const nameIdx = idx(["name", "title", "nome"]);
  const latIdx = idx(["lat", "latitude", "latitudine"]);
  const lngIdx = idx(["lng", "lon", "long", "longitude", "longitudine"]);
  const urlIdx = idx(["url", "link"]);
  const noteIdx = idx(["note", "notes", "comment", "comment"]);

  const places = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    let lat = latIdx !== undefined ? parseFloat(cols[latIdx]) : NaN;
    let lng = lngIdx !== undefined ? parseFloat(cols[lngIdx]) : NaN;

    if ((isNaN(lat) || isNaN(lng)) && urlIdx !== undefined) {
      const fromUrl = extractCoordsFromUrl(cols[urlIdx] || "");
      if (fromUrl) {
        lat = fromUrl.lat;
        lng = fromUrl.lng;
      }
    }
    if (isNaN(lat) || isNaN(lng)) continue;

    places.push({
      name: nameIdx !== undefined ? cols[nameIdx] : `Luogo ${i}`,
      lat,
      lng,
      notes: noteIdx !== undefined ? cols[noteIdx] || "" : "",
      source: sourceLabel || "import",
      category: "other",
      accessibility: "unknown"
    });
  }
  return places;
}

function splitCSVLine(line) {
  // Parser CSV minimale con supporto per campi tra virgolette.
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Estrae lat/lng da un URL di Google Maps, in vari formati noti:
// .../@45.123,12.456,17z  oppure  ?q=45.123,12.456  oppure !3d45.123!4d12.456
function extractCoordsFromUrl(url) {
  if (!url) return null;
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

// Parsing dell'incolla libera usata nel quick-add: un link Maps o una coppia
// di coordinate scritte a mano (es. copiate dalla mappa di Urbexology).
function parseFreeformCoords(text) {
  const fromUrl = extractCoordsFromUrl(text);
  if (fromUrl) return fromUrl;
  const m = text.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}
