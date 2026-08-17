# Fuori Rotta — Backend cloud (Supabase + Vercel)

Questa cartella è l'intero progetto da mettere su Vercel: contiene sia i file statici della PWA sia le function serverless in `/api`. Copre:

1. **Sync multi-device** — schedario, note, visite, impostazioni condivisi tra PC/iPad/iPhone via Supabase.
2. **Import Takeout** — risoluzione lato server dei link Google Maps senza coordinate.
3. **Tab "News"** — scoperta automatica di notizie locali su chiusure/sgomberi/edifici dismessi, classificate da un LLM, da confermare a mano prima di finire nello schedario.

Niente notifiche push in background: su un uso PC + iPad + iPhone (non tutti installati in standalone) il beneficio sarebbe parziale a fronte di parecchia complessità — il radar di prossimità resta quello della PWA, attivo quando l'app è aperta.

## 1. Supabase

1. Crea un progetto nuovo su [supabase.com](https://supabase.com) (piano Free va bene).
2. **SQL Editor → New query** → incolla tutto `supabase/schema.sql` → Run. Crea `places`, `user_settings` e `news_items` con Row Level Security già attiva.
   - Se avevi già eseguito una versione precedente dello schema (senza News), esegui invece `supabase/migration_news.sql` — aggiunge solo la tabella nuova, senza toccare quello che c'è già.
3. **Authentication → Providers → Email**: attiva il provider, disattiva **"Confirm email"** (login email+password senza email di conferma di mezzo).
4. **Project Settings → API**: copia `Project URL`, `anon public key` e `service_role key` (quest'ultima è segreta).

## 2. Vercel

1. Metti questa cartella in un repo Git così com'è (root del repo = questa cartella).
2. Su [vercel.com](https://vercel.com) → New Project → importa il repo.
3. **Framework Preset: Other.** Build Command: vuoto. Output Directory: vuoto.
4. **Settings → Environment Variables**: tutte le variabili di `.env.example` con i valori veri — incluse `ANTHROPIC_API_KEY` (da [console.anthropic.com](https://console.anthropic.com)) e `CRON_SECRET` (una stringa a caso, inventala tu).
5. Deploy.

**Attenzione — le chiavi Supabase vanno messe in due posti diversi:**
- Le function in `/api` le leggono dalle **Environment Variables di Vercel** (punto 4).
- Il frontend (`js/supabase-config.js`) le legge da un **file JS statico** — vanno compilate lì a mano con `SUPABASE_URL`/`SUPABASE_ANON_KEY` (mai la service role key, quella resta solo lato server).

## 3. La tab News: come funziona la parte automatica

`vercel.json` include un cron che chiama `/api/news-search` **una volta al giorno** — qui il limite del piano Hobby di Vercel (max 1 esecuzione/giorno per i cron nativi) va benissimo, è esattamente la cadenza giusta per notizie locali, niente workaround serviti stavolta.

Cosa fa ogni esecuzione:
1. Interroga il feed RSS pubblico di Google News (query costruita da `NEWS_REGION_QUERY`, di default `"Treviso" OR "Veneto"` — modificalo nelle env se esplori altrove) con parole chiave tipo "chiude"/"abbandonato"/"sgombero".
2. Per ogni notizia non ancora vista, chiede a Claude Haiku (modello economico, configurabile via `NEWS_MODEL`) se riguarda davvero un luogo potenzialmente interessante, e se sì estrae nome/categoria/indirizzo e un riassunto breve scritto con parole sue.
3. Salva i candidati rilevanti in Supabase (`news_items`), visibili nella tab News dell'app.

Il bottone "Cerca novità ora" nell'app chiama lo stesso endpoint su richiesta, senza aspettare il giorno dopo.

**Il geocoding non avviene qui.** Succede al volo, uno alla volta, solo quando clicchi "Aggiungi alla mappa" su una singola notizia (`/api/geocode`, proxy verso Nominatim/OpenStreetMap) — farlo in blocco per tutte le notizie del giorno rischierebbe di superare il limite di 10 secondi delle function su piano Hobby, oltre a martellare un servizio gratuito che chiede esplicitamente di non fare richieste a raffica.

## 4. Test rapidi con curl

Risolvere un URL Google Maps (nessuna autenticazione richiesta):
```bash
curl -X POST https://<tuo-dominio>.vercel.app/api/resolve-url \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://maps.google.com/@45.671,11.918,15z"]}'
```

Geocodificare un indirizzo o un nome di luogo:
```bash
curl "https://<tuo-dominio>.vercel.app/api/geocode?q=Treviso+centro"
```

Lanciare la ricerca news a mano (serve il CRON_SECRET, non un utente):
```bash
curl -X POST https://<tuo-dominio>.vercel.app/api/news-search \
  -H "x-cron-secret: <CRON_SECRET>"
```

`/api/import-takeout` richiede invece un utente vero loggato (`Authorization: Bearer <access_token>` da `supabase.auth.getSession()` nel browser) — non è ancora richiamato dal frontend, l'import Takeout per ora resta quello client-side esistente (CSV/GeoJSON con coordinate già presenti); questa function serve per il caso specifico dei link senza coordinate, da collegare quando serve davvero.

## 5. Limiti onesti

- **Risoluzione URL Takeout non garantita al 100%.** Se un link carica le coordinate via JavaScript invece che nel redirect HTTP, restano `null` e vanno inserite a mano.
- **La classificazione LLM delle notizie non è infallibile** — può segnalare cose irrilevanti o perdersi notizie vere. Per questo ogni elemento resta "da confermare": non finisce mai nello schedario senza un click esplicito.
- **La copertura dipende da cosa Google News indicizza per la tua zona.** Se le testate locali non sono ben rappresentate lì, i risultati saranno scarsi indipendentemente da tutto il resto.
- **Il geocoding può non trovare nulla** per indirizzi vaghi ("una fabbrica in zona industriale") — l'app te lo segnala e lascia il form compilabile a mano, coordinate incluse.
- **Costo:** ogni notizia nuova classificata è una chiamata all'API Anthropic (Haiku, economico ma non gratuito). Con una query geografica ristretta e una volta al giorno, il volume resta basso.
