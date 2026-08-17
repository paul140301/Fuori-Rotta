# Fuori Rotta — Backend cloud (Supabase + Vercel)

Versione **senza notifiche push in background**: dato che l'app gira su PC, iPad e iPhone e non tutti installati in standalone, il push su iOS avrebbe funzionato solo aggiungendo l'app alla Home su ogni device e riaprendola periodicamente per non far scadere la subscription — troppa complessità per un beneficio parziale. Il radar di prossimità resta quello della PWA, attivo quando l'app è aperta (che è comunque la situazione normale quando sei in giro a cercare posti).

Quello che questo pacchetto risolve davvero:
1. **Il problema concreto di Takeout** — i CSV delle liste personalizzate contengono URL senza coordinate leggibili; risolverli richiede di seguire un redirect lato server (il browser lo blocca per CORS).
2. **Sync multi-device** — schedario, note, visite, impostazioni (raggio, velocità, casa) condivisi tra PC/iPad/iPhone invece di vivere isolati nel localStorage di ciascuno.

## 1. Supabase

1. Crea un progetto nuovo su [supabase.com](https://supabase.com) (piano Free va bene).
2. **SQL Editor → New query** → incolla `supabase/schema.sql` → Run. Crea `places` e `user_settings` con Row Level Security già attiva.
3. **Authentication → Providers → Email**: attiva il provider. Per un'app personale conviene **disattivare "Confirm email"**: così la registrazione (email+password) crea subito una sessione valida, senza email di conferma di mezzo — niente redirect che possa dare "connection refused".
4. **Project Settings → API**: copia `Project URL` e `anon public key`.

## 2. Vercel

1. Questa cartella **è** il progetto: contiene sia i file statici della PWA (`index.html`, `css/`, `js/`, `manifest.json`, `service-worker.js`, `icons/`) sia le function serverless (`api/`, `lib/`) e le loro dipendenze (`package.json`). Mettila in un repo Git così com'è (root del repo = questa cartella).
2. Su [vercel.com](https://vercel.com) → New Project → importa il repo.
3. **Framework Preset: Other.** Build Command: vuoto. Output Directory: vuoto (di default Vercel serve i file statici dalla root e riconosce da sola `/api` come function).
4. **Settings → Environment Variables**: incolla `SUPABASE_URL` e `SUPABASE_ANON_KEY` da `.env.example` (servono alle function in `/api`, non al frontend — vedi punto 3 sotto).
5. Deploy. Con login email+password non serve configurare redirect URL in Supabase (nessun link via email è coinvolto).

**Attenzione — due posti diversi per le stesse chiavi:**
- Le function in `/api` leggono `SUPABASE_URL`/`SUPABASE_ANON_KEY` dalle **Environment Variables di Vercel** (punto 4 sopra).
- Il frontend (`js/supabase-config.js`) le legge invece da un **file JS statico**, perché non c'è build step che inietti variabili d'ambiente nel client. Vanno compilate a mano in quel file con **gli stessi valori**, prima di fare il deploy (o le rifai dopo e ripubblichi).

## 3. Test rapido con curl

Risolvere un URL Google Maps (nessuna autenticazione richiesta, non tocca il database):
```bash
curl -X POST https://<tuo-dominio>.vercel.app/api/resolve-url \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://maps.google.com/@45.671,11.918,15z"]}'
```

`/api/import-takeout` richiede invece un utente vero loggato (`Authorization: Bearer <access_token>` da `supabase.auth.getSession()`) — ha senso solo una volta collegato il frontend, Fase 2.

## 4. Limiti onesti

- **Risoluzione URL non garantita al 100%.** Se un link Google Maps carica le coordinate via JavaScript invece che nel redirect HTTP, `lat`/`lng` tornano `null` e il luogo va aggiunto a mano (l'app te lo segnala nel campo `unresolved`).
- **Import a blocchi.** Il piano Hobby di Vercel taglia le function a 10 secondi: `/api/import-takeout` accetta max 150 righe a chiamata; per stare larghi conviene che il client mandi blocchi da 40-50 righe.

## 5. Fase 2 — collegare il frontend (quando sei pronto)

Cosa cambia, in sintesi:
- `js/db.js` diventa un thin wrapper su `supabase-js` invece che su `localStorage` — stessa forma delle funzioni (`all()`, `upsert()`, `remove()`...) ma asincrone, quindi in `app.js` alcune chiamate prendono un `await`.
- Una schermata di login minimale (email + password), la stessa su tutti e tre i device.
- Il bottone di import CSV Takeout chiama `/api/import-takeout` a blocchi invece di fare tutto in locale.
- Radar, mappa, itinerario restano identici — cambia solo da dove arrivano i dati, e ora sono la stessa cosa su PC, iPad e iPhone.
