# Business HQ

A little operating system for your business that runs on **every device you own** — Mac Studio, MacBook Pro, iPad and iPhone — as an installable web app (PWA). No accounts, no subscriptions, works offline. Your data stays on your devices.

## What it does

- **CRM** — clients with contact details, notes, and one-tap call/email. Each client shows what they owe you and what you haven't billed yet.
- **Pushes you to invoice** — log work as you do it; after a week of unbilled work the dashboard nags you with a one-tap **"Create invoice"** button that turns the work log into a numbered invoice. It also nags about drafts you never sent and chases overdue invoices for you.
- **Invoices** — draft → sent → paid workflow, print/save as PDF, or open a pre-written email to the client with the invoice summary and your payment details.
- **Travel docs** — trip log (from/to, km, business vs personal, optional client link) and a fuel log (cost, litres, odometer, station). The dashboard shows business km for the financial year and the estimated deduction at your per-km rate.
- **GOFAR** — GOFAR has no public API, but the app exports trips as CSV: in GOFAR go to **Logbook → Export → CSV**, save it to iCloud Drive / Files, then in Business HQ hit **Trips → Import GOFAR CSV**. Columns are auto-matched (you can adjust), duplicates are skipped, and untagged trips land as "uncategorised" so the dashboard reminds you to sort them.

## Getting it onto your devices

The app is a static site — it needs to be served over HTTPS once, then each device installs and caches it (it keeps working offline afterwards).

**Easiest: GitHub Pages**
1. In this repo: **Settings → Pages → Deploy from a branch**, pick your branch and `/ (root)`.
2. Your app lives at `https://<your-username>.github.io/<repo>/crm/`.

Then on each device, open that URL once:

| Device | How to install |
|---|---|
| **iPhone / iPad** (Safari) | Share button → **Add to Home Screen**. It gets its own icon and runs full-screen like a native app. |
| **Mac Studio / MacBook Pro** (Safari 17+) | **File → Add to Dock**. |
| **Mac** (Chrome/Edge) | Install icon in the address bar → **Install Business HQ**. |

## Moving data between devices

Each device keeps its own local copy (browser `localStorage`). To sync:

1. On the device with the latest data: **Settings → Export backup** — save the `.json` file to **iCloud Drive**.
2. On the other device: **Settings → Import backup** — pick that file.

Do the export whenever you've entered a batch of stuff; treat one device (e.g. the Mac Studio) as the "master" if that's simpler. The backup file is also your safety net — keep a few around.

> Want real-time sync instead? The data layer is one JSON blob (`bizhq.data.v1` in localStorage), so wiring it to a hosted backend (e.g. Supabase) later is a contained change — everything else stays the same.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | All app logic (vanilla JS, no build step, no dependencies) |
| `styles.css` | Styling — light & dark mode, phone/tablet/desktop layouts |
| `manifest.webmanifest` | Makes it installable |
| `sw.js` | Service worker — caches the app so it works offline |
| `icons/` | App icons |

## Tips

- **Defaults are Australian** (AUD, ATO $0.88/km, FY starting 1 July) — change them in Settings.
- Set your **hourly rate, invoice prefix and payment details** in Settings first; invoices and the email template pick them up automatically.
- The red badges on the **Invoices** and **Trips** tabs are your to-do count: overdue invoices and uncategorised trips.
