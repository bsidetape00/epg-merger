# Business HQ

A one-person business workspace that runs on **every device you own** — Mac Studio, MacBook Pro, iPad and iPhone — as an installable web app (PWA). No accounts, no subscriptions, works offline. Your data stays on your devices.

Inspired by the "one connected workspace instead of a dozen apps" idea behind [macro.com](https://macro.com), scoped to what a solo operator can run without a server.

## What's in it

| Area | What it does |
|---|---|
| **Home** | One prioritized feed of everything that needs you: overdue invoices, overdue/due-today tasks, today's events, "time to invoice" nudges, drafts you never sent, deals going cold, uncategorised trips. Triage from the keyboard (`j`/`k`, `Enter`, `e` done, `s` snooze, `t` make a task). |
| **CRM** | Deal pipeline (Lead → Quoted → Active → Won/Lost) and client records. **It keeps itself current:** sending an invoice moves the client's deal to Active, getting paid moves it to Won, and every client gets a timeline built automatically from work, invoices, tasks, docs and events — plus manual notes/calls/emails. Deals with no activity for 14 days (configurable) surface as "going cold". |
| **Tasks** | Board and list views, priorities, due dates, and recurring routines (weekly → quarterly BAS). Create a task from anywhere — a feed item, an overdue invoice, a client. |
| **Money** | Log work → one-tap invoice → draft/sent/paid, print to PDF, pre-written emails and overdue reminders. |
| **Docs** | Plain-markdown notes with templates (meeting notes, quote, job sheet), `@` mentions that link to clients/invoices/docs, clickable checklists, live preview, autosave and version history with restore. |
| **Calendar** | Week view combining your events, task due dates and invoice due dates. Export `.ics` to put it in Apple Calendar on every device. |
| **Trips & fuel** | Trip log with business/personal tagging, fuel log, per-km deduction estimate for the financial year, **GOFAR CSV import**, and **auto-tagging**: trips on a route you've already categorised (either direction) are tagged for you. |
| **Search & quick add** | `⌘K` / `Ctrl+K` (or `/`) searches everything and takes plain-English commands — see below. |
| **Themes** | Auto, Paper, Indigo, Graphite, Void (OLED black), Ember, Forest. |
| **Sample data** | Settings → *Load sample data* fills every screen with clearly-marked example records so you can try it; *Remove sample data* deletes only those, never your own. |

### Quick add (⌘K)

```
task call Sarah tomorrow !1          log 2h Sarah site visit
fuel 92.50 Ampol Penrith 48l         trip 23km business Home to Penrith
event quote walkthrough fri 3pm      call Sarah wants a revised quote
client Bob Smith
```

Dates understood: `today`, `tomorrow`, `fri`, `next week`, `+3d`, `in 3 days`, `2026-08-01`. `!1`/`!2`/`!3` sets priority.

### Keyboard

`⌘K` search · `c` create · `g` then `h`/`c`/`t`/`m`/`d`/`l`/`r`/`s` to jump (Home, CRM, Tasks, Money, Docs, Calendar, Trips, Settings) · `?` for the full list.

## Not included (and why)

Macro is a multi-user cloud product. These parts need a server, shared accounts, or an AI service, so they are **not** here: shared email inbox, team chat, video calls, AI agents, booking links, real-time multiplayer editing, and cross-device live sync. Logging an email or call into the CRM is manual (paste the subject into the client's *Log activity* box). If you want live sync or AI features later, the data layer is a single JSON document (`bizhq.data.v1`), so adding a hosted backend is a contained change.

## Getting it onto your devices

It's a static site — serve it over HTTPS once, then each device installs and caches it.

**GitHub Pages (one-time setup)**
1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. The included workflow deploys automatically on every push.
3. Open the published URL on each device:

| Device | How to install |
|---|---|
| **iPhone / iPad** (Safari) | Share → **Add to Home Screen** |
| **Mac Studio / MacBook Pro** (Safari 17+) | **File → Add to Dock** |
| **Mac** (Chrome/Edge) | Install icon in the address bar |

### After an update

The app caches itself for offline use. After a new version deploys, open it once online and then close/reopen it (or pull to refresh on iOS) to pick up the update.

## Moving data between devices

Each device keeps its own copy in browser storage. To sync: **Settings → Export backup** on the device with the latest data, save the `.json` to **iCloud Drive**, then **Settings → Import backup** on the other device. Backups from the first version (v1) import fine. Treat one device as the "master" to avoid overwriting newer data, and keep a few old backups as a safety net.

## GOFAR

GOFAR has no public API, so use its CSV export: **Logbook → Export → CSV**, save to Files/iCloud Drive, then **Trips → Import GOFAR CSV**. Columns are auto-matched (adjust if needed); duplicates are skipped; dates like `25/06/2026 08:12` (day-first) and `2026-06-25 08:12` both work; trips on known routes are auto-tagged and the rest land as "uncategorised".

## Files

```
index.html            app shell
styles.css            styling (light/dark/themes, phone/tablet/desktop)
manifest.webmanifest  makes it installable
sw.js                 service worker (offline)
icons/                app icons
js/core.js            store, helpers, router, modal, toast
js/home.js            prioritized feed + keyboard triage
js/crm.js             pipeline, clients, timeline
js/tasks.js           tasks, routines, natural-language dates
js/docs.js            markdown docs, mentions, history
js/calendar.js        week view + .ics export
js/money.js           work log + invoices
js/trips.js           trips, fuel, GOFAR import, auto-tagging
js/settings.js        settings, themes, backup/restore
js/palette.js         search, quick add, global shortcuts
js/boot.js            startup
```

No build step and no dependencies — edit and refresh.

## Defaults

Australian: AUD, ATO $0.88/km, financial year from 1 July. Change them in Settings. All dates use your device's local time zone.
