// POST /api/resolve-url
// Body: { urls: string[] }
// Risposta: { results: [{ url, resolvedUrl, lat, lng }] }
//
// Nessuna autenticazione richiesta: non tocca il database, si limita a
// seguire redirect pubblici. Usata sia da import-takeout.js che, se serve,
// direttamente dal client per risolvere un singolo link incollato a mano.

const { resolveOne } = require("../lib/resolve");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo non consentito" });

  const { urls } = req.body || {};
  if (!Array.isArray(urls) || !urls.length) {
    return res.status(400).json({ error: "'urls' deve essere un array non vuoto" });
  }
  if (urls.length > 300) {
    return res.status(400).json({ error: "Troppi URL in un colpo solo (max 300, dividi in più chiamate)" });
  }

  const results = await Promise.all(urls.map(resolveOne));
  res.status(200).json({ results });
};
