# Fuori Rotta — Urbex Companion

PWA (Progressive Web App) per pianificare uscite di esplorazione urbana: radar di prossimità, schedario dei luoghi con note/visite/accessibilità, e pianificatore di itinerari.

## ⚠️ Cose da sapere prima di iniziare (letto onestamente, non nascosto in fondo)

**1. Nessuna delle due fonti dati ha un'API pubblica.**
Google non espone un'API per leggere le liste salvate *personali* di Google Maps di un utente, e Urbexology non offre un export o un'API ufficiale (probabilmente anche per proteggere i luoghi da vandalismo). Di conseguenza:
- La lista "Urbex" di Google Maps si importa **una volta, manualmente**, tramite Google Takeout (istruzioni sotto). Non c'è sync automatico continuo: se aggiungi luoghi su Google Maps dopo l'import, andranno reimportati (l'app salta i duplicati, quindi puoi ripetere l'import quando vuoi).
- I luoghi di Urbexology vanno aggiunti **uno alla volta** copiando le coordinate dal loro sito e incollandole nel form "+ Aggiungi luogo" dell'app. Non ho scritto uno scraper: violerebbe ragionevolmente i loro termini d'uso e non è comunque affidabile nel tempo.
- Nessuna delle due può essere scritta "indietro" verso Google Maps: l'app non salva nulla sul tuo account Google.

**2. I dati vivono su Supabase**, sincronizzati tra PC, iPad e iPhone con lo stesso login email+password. Prima di usare l'app la prima volta:
1. Segui `DEPLOY.md` per creare il progetto Supabase ed eseguire `schema.sql`.
2. Compila `js/supabase-config.js` con l'URL e l'anon key del tuo progetto.
3. In Supabase → Authentication → Providers → Email, disattiva "Confirm email" (altrimenti la registrazione richiede comunque un'email di conferma).

Il pulsante **Esporta JSON** in Impostazioni resta comunque utile come backup offline.

**3. Le notifiche di prossimità funzionano solo ad app aperta** (o in background su Android se l'hai installata come app). iOS Safari non permette il monitoraggio GPS in background senza un server push dedicato — è un limite della piattaforma, non dell'app. In pratica: apri l'app quando sei in zona, il radar si aggiorna comunque in tempo reale.

**4. La mappa usa OpenStreetMap** (gratuita, nessuna chiave API richiesta) invece di Google Maps — non ho la tua chiave Google Maps Platform e non volevo forzarti a crearne una a pagamento solo per questo progetto.

## Come si installa (serve un server, non basta aprire il file)

I service worker (necessari per l'installazione come app e per l'uso offline) non funzionano se apri `index.html` direttamente col doppio click (protocollo `file://`). Serve un piccolo server HTTP, anche locale:

**Opzione rapida per provarla subito (dal tuo PC):**
```bash
cd fuori-rotta-pwa
python3 -m http.server 8080
```
poi apri `http://localhost:8080` dal telefono (stessa rete Wi-Fi, sostituendo `localhost` con l'IP del PC) o dal PC stesso.

**Opzione permanente (consigliata, e coerente col resto del tuo stack self-hosted):**
Carica la cartella su un piccolo container Nginx/Caddy nel tuo Proxmox, oppure su GitHub Pages / Netlify / Vercel (gratuiti, HTTPS incluso, drag & drop della cartella). Una volta raggiungibile via HTTPS (o `localhost`), il browser mostrerà il prompt "Installa app" / "Aggiungi a Home" — su Android è automatico, su iOS Safari: condividi → Aggiungi a Home.

## Come importare la lista "Urbex" da Google Maps

1. Vai su [takeout.google.com](https://takeout.google.com) con lo stesso account di Google Maps.
2. "Deseleziona tutto", poi seleziona solo **Maps (Le tue attività)**.
3. Tra le opzioni di esportazione dei dati Maps, includi i **luoghi salvati** — otterrai un file per ogni lista, incluso qualcosa come `Urbex.json`.
4. Nell'app: Impostazioni → **Importa lista "Urbex"** → seleziona quel file.

## Come aggiungere luoghi da Urbexology

Apri la mappa di Urbexology, clicca sul pin che ti interessa, copia le coordinate mostrate. Nell'app tocca **"+"**, incolla le coordinate nel campo apposito (riconosce sia `45.123, 12.456` che link Google Maps con `@lat,lng`), dai un nome e categorizza.

## Funzionalità

- **Radar** — vista SVG con anelli di distanza (¼, ½, ¾, raggio impostato) e i luoghi salvati posizionati per rotta/distanza reale dal GPS. Raggio d'allarme configurabile (5/10/20/50 km, default 10 km come richiesto). Notifiche opzionali quando entri nel raggio.
- **Mappa** — tutti i luoghi su mappa OpenStreetMap, con la tua posizione live. **Tieni premuto un punto vuoto** (o clic destro da desktop) per aggiungere un luogo lì: si apre il form con le coordinate già compilate, un marker tratteggiato segna il punto finché non salvi o annulli.
- **Desktop** — sopra gli 880px di larghezza la barra di navigazione diventa una sidebar laterale, i moduli si aprono come finestre centrate invece che a tutta larghezza, lo schedario passa a griglia e l'itinerario (oltre i 1200px) mostra tappe ed esito fianco a fianco. Sotto gli 880px resta l'interfaccia telefono invariata.
- **Luoghi** — schedario con ricerca, filtro per categoria/stato, note libere, numero di visite, flag "già stato", livello di accessibilità (facile/media/difficile/murato/da verificare). Il dettaglio di ogni luogo ha un bottone **"Apri in Maps"** che porta dritto alle coordinate in Google Maps (app o web, a seconda del device).
- **Account** — login email+password, stesso accesso su PC/iPad/iPhone, dati sincronizzati su Supabase con Row Level Security (solo tu vedi i tuoi luoghi).
- **Itinerario** — scegli le tappe (o usa "✨ Suggerisci vicini" per aggiungere automaticamente i luoghi non visitati entro 30 km da un punto), imposta la velocità media, e ottieni un ordine di visita ottimizzato (nearest-neighbor) con tempo di viaggio, tempo di sosta per categoria e durata totale stimata. Un tasto apre il percorso completo in Google Maps per la navigazione vera e propria.
- **Categorizzazione** — 10 categorie (industriale, ospedale/manicomio, militare/bunker, villa, religioso, rurale, infrastruttura, sotterraneo, parco/svago, altro), ciascuna con un tempo di visita di default usato dal pianificatore.

## Note tecniche

Nessuna build necessaria: HTML/CSS/JS vanilla + Leaflet (mappa) via CDN. Struttura:

```
index.html
manifest.json
service-worker.js
css/style.css
js/db.js          storage locale (localStorage) + backup JSON
js/geo.js         haversine, bearing, watch GPS, notifiche
js/categories.js  tassonomia categorie/accessibilità
js/importer.js    parsing Google Takeout GeoJSON, CSV generico, link Maps
js/itinerary.js   pianificatore percorso (nearest-neighbor) + stime tempo
js/map.js         wrapper Leaflet/OpenStreetMap
js/radar.js       vista radar SVG
js/app.js         wiring UI e stato applicazione
icons/            icone PWA
```
