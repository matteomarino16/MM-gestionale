# Gestionale MM

Gestionale web privato per clienti, servizi digitali, domini, rinnovi, crediti, debiti e pagamenti.
Interfaccia in italiano, EUR, fuso Europe/Rome, date DD/MM/YYYY.

## Stato dello sviluppo

| Fase | Contenuto | Stato |
| --- | --- | --- |
| 1 | Fondamenta: Next.js, PostgreSQL, schema Prisma completo, migrazioni, autenticazione, layout | ✅ completata |
| 2–3 | Clienti, fornitori, servizi (CRUD, ricerca, schede) | ✅ completata |
| 4 | Registro economico: crediti, debiti, pagamenti parziali | ✅ completata |
| 5 | Rinnovi, regole promemoria, worker con outbox e idempotenza, app installabile | ✅ completata |
| 6 | Web Push, service worker, modalità offline | da fare |
| 7 | Documenti privati, PDF, report, CSV | da fare |
| 8 | Backup/ripristino verificati, collaudo finale | da fare |

Lo **schema del database è già completo** per tutte le fasi (tabelle, vincoli, indici): le fasi successive aggiungono logica e interfaccia.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Base UI) ·
PostgreSQL 17 · Prisma 7 (driver adapter `pg`) · Zod 4 · Argon2id (`@node-rs/argon2`) ·
Vitest 5 · Playwright.

## Prerequisiti

- Node.js ≥ 22.12 (`node -v`)
- PostgreSQL 17, **una** delle due opzioni:
  - Homebrew: `brew install postgresql@17 && brew services start postgresql@17`
  - Docker: `docker compose up -d` (usa `docker-compose.yml`, credenziali da `.env`)

## Installazione

```bash
npm install
cp .env.example .env          # poi modifica i valori
```

Con PostgreSQL di Homebrew, crea utente e database (sostituisci la password con una generata da `openssl rand -hex 24`):

```bash
psql -d postgres -c "CREATE ROLE gestionale WITH LOGIN CREATEDB PASSWORD 'LA_TUA_PASSWORD';"
psql -d postgres -c "CREATE DATABASE gestionale OWNER gestionale;"
psql -d postgres -c "CREATE DATABASE gestionale_test OWNER gestionale;"
```

Poi:

```bash
npm run db:migrate            # applica le migrazioni
npm run db:seed               # regole promemoria e categorie di costo predefinite (nessun dato fittizio)
npm run admin:create -- --email tu@esempio.it --name "Nome Cognome"
npm run dev                   # http://localhost:3000
```

La registrazione pubblica non esiste: l'unico modo per creare l'account è lo script `admin:create`,
che chiede la password senza mostrarla e rifiuta di creare un secondo amministratore.
Per reimpostare una password dimenticata: `npm run admin:create -- --email tu@esempio.it --reset-password`.

## Comandi

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` / `npm start` | build e avvio in produzione |
| `npm run typecheck` | controllo TypeScript |
| `npm run lint` | ESLint |
| `npm test` | test unitari e di integrazione (Vitest) |
| `npm run test:e2e` | test end-to-end (Playwright, desktop + mobile) |
| `npm run db:migrate:dev` | crea una nuova migrazione dopo modifiche allo schema |
| `npm run worker` | worker dei promemoria in ciclo continuo (locale / server) |
| `npm run worker:once` | un solo ciclo del worker |
| `npm run db:studio` | Prisma Studio |

### Test

I test di integrazione ed e2e usano **un database separato** (`TEST_DATABASE_URL`) che viene svuotato
a ogni esecuzione; per sicurezza il nome del database deve contenere `test`.
La prima volta: `npx playwright install chromium`.
I test e2e avviano un proprio server su `localhost:3100` (build in `.next-e2e/`) con un amministratore
dalla password casuale; non toccano il database principale.

## Architettura

```
prisma/                schema.prisma, migrazioni, seed
scripts/               create-admin.ts (backup/ripristino nelle fasi successive)
src/app/(auth)/        login
src/app/(app)/         area protetta: dashboard, impostazioni, … (layout con sidebar)
src/components/        ui/ (shadcn), layout/, forms/
src/modules/           logica di dominio per modulo (auth, reminders, …)
src/lib/auth/          password, sessioni, rate limit, DAL, cookie
src/lib/db/            client Prisma
src/lib/timezone/      date civili e istanti nel fuso locale
src/proxy.ts           controllo ottimistico del cookie (Next 16: ex middleware)
tests/unit|integration|e2e
```

### Scelte tecniche e assunzioni

- **Cache Components disattivato** (`cacheComponents: false`): ogni pagina dipende dalla sessione e da
  dati sempre aggiornati, quindi il rendering dinamico è la scelta più semplice e sicura.
- **Sessioni nel database**: il cookie contiene un token casuale a 256 bit; nel DB c'è solo il suo SHA-256.
  Scadenza per inattività (default 7 giorni, prorogata con l'uso) e limite assoluto (default 30 giorni).
  Le sessioni si possono revocare da *Impostazioni*; il cambio password chiude le altre.
- **Cookie**: `HttpOnly`, `SameSite=Lax`, `Secure` + prefisso `__Host-` quando `APP_URL` è https.
- **CSRF**: le Server Action di Next.js verificano Origin/Host; i Route Handler che modificano dati useranno
  `isSameOriginRequest`. SameSite=Lax è una seconda barriera.
- **Autorizzazione**: il proxy controlla solo la presenza del cookie; ogni pagina, azione e API valida la
  sessione sul DB tramite il Data Access Layer (`src/lib/auth/dal.ts`).
- **Rate limiting** persistente su DB: 5 tentativi falliti per email e 20 per IP in 15 minuti.
  L'IP è letto da `X-Forwarded-For` solo con `TRUST_PROXY=true` (dietro un reverse proxy fidato).
- **Denaro**: `NUMERIC(12,2)` nel DB e `Decimal` nel codice, mai floating point.
  Crediti: `amountDue = imponibile + IVA − ritenuta`; debiti: `amountDue = (effettivo ?? previsto) + IVA`
  — coerenza garantita da vincoli CHECK.
- **Date**: le scadenze sono date civili (`DATE`) senza conversioni di fuso; gli istanti sono `timestamptz`.
  Gli anticipi dei promemoria si calcolano in giorni di calendario e l'ora (default 09:00) nel fuso IANA,
  gestendo ora legale/solare (testato).
- **Storico finanziario**: nessuna cancellazione a cascata dei dati economici (`ON DELETE RESTRICT`);
  i clienti si archiviano, i pagamenti errati si stornano (`voidedAt`) invece di cancellarli.
- **Mapping richiesta → schema**: "Entrate" = `Receivable`, "Uscite" = `Payable` (con `ExpenseCategory`),
  "Commesse" = `Project`, "Preventivi" = `Quote`, "Attività" = `Task`; la coda dei promemoria è `ReminderEvent`
  (outbox con chiave di idempotenza UNIQUE).
- **Tema chiaro/scuro** senza dipendenze: script inline nel `<head>` (pattern della guida Next.js
  "Preventing flash before hydration"), preferenza salvata nel browser.
- **Font di sistema**: nessuna dipendenza da Google Fonts, l'app funziona anche offline.

### Clienti, fornitori e servizi (fasi 2–3)

- **Clienti**: creazione, modifica, archiviazione/ripristino (nessuna cancellazione), ricerca su nome,
  email, PEC, telefono, P.IVA, codice fiscale, città e domini dei servizi; filtri per stato e tipologia,
  ordinamento e paginazione. La scheda mostra anagrafica, scadenze a 60 giorni, servizi, crediti,
  pagamenti, costi, commesse, preventivi, attività, documenti e storico delle operazioni, con indicatori
  economici calcolati in PostgreSQL (ricavi concordati, incassato, crediti residui e scaduti, costi, margine).
- **Fornitori**: CRUD, disattivazione; l'eliminazione è consentita solo se il fornitore non è mai stato usato.
- **Servizi**: catalogo per tipologia, frequenze mensile/trimestrale/semestrale/annuale/biennale/personalizzata
  (giorni o mesi) o una tantum, costo e prezzo per ciclo con anteprima del margine, IVA, rinnovo automatico.
  - Un servizio attivo, ricorrente e con scadenza ha sempre **un ciclo di rinnovo aperto** (creato automaticamente).
  - Spostare la scadenza aggiorna il ciclo aperto e ne incrementa la `deadlineRevision`: nella fase 5 il worker
    scarterà i promemoria calcolati sulla revisione precedente.
  - Gli importi di un ciclo già avviato (non più "Previsto") non vengono sovrascritti dalle modifiche al servizio.
  - Annullare il servizio chiude il ciclo aperto; rinnovi, crediti e costi restano nello storico.
  - Le modifiche allo stesso servizio sono serializzate con `SELECT … FOR UPDATE`.
- **Ricerca globale** nell'header (scorciatoia `/`) su clienti, servizi/domini, fornitori, crediti e costi.
- **Importi**: formato italiano (`1.234,56`). Senza virgola, un punto seguito da tre cifre è il separatore delle
  migliaia (`1.250` = 1250), altrimenti è il separatore decimale (`12.50`, tastiere numeriche dei telefoni).

### Registro economico (fase 4)

- **Entrate** (`/entrate`): crediti verso i clienti. Dovuto = imponibile + IVA − ritenuta d'acconto, calcolato
  sul server con arrotondamento commerciale al centesimo.
- **Uscite** (`/uscite`): costi verso i fornitori, con importo previsto ed effettivo (a consuntivo) e categorie di costo.
- **Pagamenti** (`/pagamenti`): ogni incasso/pagamento è un movimento indipendente; i saldi si ricalcolano dalla
  somma dei movimenti non stornati, con lock di riga per evitare pagamenti concorrenti oltre il dovuto.
  Un errore si corregge con uno **storno** motivato: il movimento resta nello storico. Date future rifiutate.
- Filtri per periodo (giorno, settimana lun–dom, mese, trimestre, anno, intervallo), stato (incluso "scaduto",
  derivato dalla data), cliente/fornitore/categoria.
- Dalla scheda di un servizio o di un rinnovo si crea il credito o il costo già precompilato.

### Rinnovi e promemoria (fase 5)

- **Rinnovi** (`/rinnovi`): per ogni ciclo si vedono stato operativo, pagamento del cliente e del fornitore
  (derivati dai crediti/costi collegati). Il pagamento del cliente **non** segna il rinnovo come effettuato: serve la
  conferma esplicita con data del rinnovo e nuova scadenza. Il ciclo completato resta nello storico e si apre il
  successivo. "Non rinnovare" annulla il ciclo e segna il servizio come scaduto.
- **Regole** (`/impostazioni/promemoria`): rinnovi 30/14/7 giorni prima, giorno della scadenza, poi ogni 7 giorni se
  irrisolto; crediti 7 giorni prima, alla scadenza, il giorno dopo e poi ogni 7 giorni. Orario configurabile
  (default 09:00, Europe/Rome, con ora legale/solare). Le regole si attivano/disattivano o se ne aggiungono di nuove.
- **Coda persistente** (`ReminderEvent`): ogni evento ha una chiave univoca
  `tipo:risorsa:revisione:regola[:occorrenza]:canale` (es. `renewal:<id>:r2:30d:push`) e viene inserito con
  `ON CONFLICT DO NOTHING`. L'elaborazione acquisisce gli eventi con `FOR UPDATE SKIP LOCKED`, rilegge lo stato
  aggiornato della risorsa, crea la notifica una sola volta (chiave univoca) e una consegna push per dispositivo
  (`UNIQUE(notification, subscription)`). Errori → nuovo tentativo con backoff esponenziale (max 5), poi `FAILED`.
  Eventi rimasti "in lavorazione" da un worker interrotto vengono ripresi dopo 5 minuti.
- **Avvisi obsoleti**: modificare una scadenza ne incrementa la revisione; gli eventi in coda della revisione
  precedente, o di risorse saldate/annullate/sospese, vengono rimossi. Le notifiche non lette di crediti saldati e
  rinnovi chiusi vengono archiviate. Dopo un arresto prolungato si recupera solo l'avviso più recente.
- **Dove gira il worker**:
  - in locale: `npm run worker` (sicuro con più istanze);
  - su Vercel: cron giornaliero `vercel.json` → `GET /api/cron/reminders` protetto da `CRON_SECRET`
    (con il piano Hobby i cron sono al massimo giornalieri), più un ciclo eseguito dopo il caricamento di una pagina
    dell'app al massimo ogni 10 minuti (`after()`), così aprendo l'app gli avvisi sono sempre aggiornati.

### App sull'iPhone

Il gestionale è una PWA installabile: manifest, icone, apertura a schermo intero, barra di navigazione in basso
e aree sicure dell'iPhone.

1. Apri l'indirizzo del gestionale in **Safari** sull'iPhone ed effettua l'accesso.
2. Tocca **Condividi** (il quadrato con la freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
3. Apri il gestionale dall'icona "Gestionale": si avvia a schermo intero sulla Dashboard.

Le notifiche push sull'iPhone (iOS 16.4+) funzionano solo dall'app aggiunta alla schermata Home: arrivano con la fase 6.

### Pubblicazione su Vercel

- Database: PostgreSQL Neon collegato dal marketplace Vercel (`DATABASE_URL`).
- Variabili: `APP_URL` (es. `https://mm-gestionale.vercel.app`), `TRUST_PROXY=true`, `APP_TIMEZONE=Europe/Rome`,
  `CRON_SECRET` (genera con `openssl rand -hex 32`).
- Le migrazioni vengono applicate automaticamente a ogni deploy: Vercel esegue lo script `vercel-build`
  (`prisma migrate deploy && next build`) usando la connessione diretta `DATABASE_URL_UNPOOLED`. Se una migrazione
  fallisce il deploy si ferma e resta online la versione precedente. Nota: anche i deploy di anteprima usano lo stesso
  database, quindi le migrazioni vanno pubblicate solo quando sono pronte.
- Il client del database si connette alla prima query: la build non richiede variabili d'ambiente.

### Vincoli SQL aggiuntivi

> Gli indici trigram non sono descritti nello schema Prisma: quando `npm run db:migrate:dev` genera una nuova
> migrazione, rimuovere le istruzioni `DROP INDEX "…_trgm_idx"` che propone.


`prisma/migrations/*_constraints/migration.sql` contiene i vincoli che Prisma non esprime: CHECK su importi,
aliquote, stati e coerenza dei totali; un solo ciclo di rinnovo aperto per servizio (indice UNIQUE parziale);
rinnovo "completato" solo con data effettiva e nuova scadenza; pagamento collegato al credito o al debito
corretto; indici trigram (`pg_trgm`) per la ricerca globale.

## Sicurezza: cose da sapere

- `.env` non va mai committato (è in `.gitignore`); `.env.example` non contiene segreti.
- Il server di sviluppo non va esposto direttamente su Internet.
- Le password non vengono mai registrate nei log né nell'audit log.
