// Risolve un URL di Google Maps (spesso un link "corto" a place_id, senza
// coordinate leggibili) seguendo i redirect lato server — cosa che il
// browser non può fare per via del CORS. Non usa API interne non
// documentate di Google: segue solo gli header Location standard HTTP.
//
// Limite onesto: alcuni URL non espongono le coordinate nemmeno nella
// destinazione finale (la pagina le carica via JS lato client). In quei
// casi il campo lat/lng resta null e va inserito a mano nell'app — non è
// un bug risolvibile senza usare una API a pagamento tipo Google Geocoding.

async function followRedirects(url, maxHops = 6) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    let resp;
    try {
      resp = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FuoriRottaBot/1.0)" }
      });
    } catch (e) {
      break;
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) break;
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  return current;
}

function extractCoords(url) {
  if (!url) return null;
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

async function resolveOne(url) {
  try {
    const finalUrl = await followRedirects(url);
    const coords = extractCoords(finalUrl);
    return { url, resolvedUrl: finalUrl, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
  } catch (e) {
    return { url, lat: null, lng: null, error: String(e) };
  }
}

module.exports = { followRedirects, extractCoords, resolveOne };
