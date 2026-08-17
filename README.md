# Douglas County House Hunt & School Tracker

A small local web app for tracking candidate houses, their assigned schools,
and follow-up tasks while house-hunting in the Douglas County School District
(Colorado) area. Runs on one computer on your home network; both of you can
open it from your own laptop/phone.

## Latest Updates — August 2026

✅ **Feature-Complete App**
- Multi-user support ready for implementation
- Comparative analytics 60% complete
- App imports successfully with zero errors

📊 **Upcoming Features**
- Multi-user authentication (Week 2-3)
- Finish comparative analytics (Week 1)
- School boundary lookup (Week 6-12)
- MLS feed integration (Week 6-12)

📚 **Documentation**
- [Project Status Overview](../sql-optimizer-bq/docs/00-PROJECT-STATUS.md) — Current state & roadmap
- [Implementation Guide](../sql-optimizer-bq/docs/OPTION_D_PROJECT_IMPLEMENTATION_GUIDES.md) — Week-by-week plans

## Running it

```
cd house-hunt-tracker
pip install -r requirements.txt
python app.py
```

The server starts on port 5050 by default (set the `PORT` environment
variable to use a different one) and is reachable from any device on your
home network.

The app requires a login (HTTP Basic Auth) — default username `abcdef`,
password `QOU8IGg89LDB4NACKcve`. Override either with the `AUTH_USERNAME` /
`AUTH_PASSWORD` environment variables before starting the server. This
matters more if you ever port-forward the app to be reachable from outside
your home network — don't do that without changing these from the defaults
documented here.

- On the computer running it: open `http://localhost:5050`
- On the other adult's laptop/phone: find the host computer's local network IP
  (on Windows, run `ipconfig` and look for "IPv4 Address", e.g. `192.168.1.42`),
  then open `http://192.168.1.42:5050` in a browser on the same Wi-Fi network.

Leave the `python app.py` terminal window running while you use the app — it's
what serves the pages and saves your data. Closing it stops the server (your
data is safe on disk either way).

## Data & persistence

All data lives in `data.json` in this folder, written automatically a moment
after every edit (see the "Saving…" / "All changes saved" indicator in the
top-right corner). Back it up by copying `data.json` — it's a plain JSON file.

The app also keeps its own automatic backups: every time a change is saved,
the *previous* version is snapshotted into `backups/data-YYYYMMDD-HHMMSS.json`
before the new version is written (skipped if nothing actually changed). The
most recent 30 snapshots are kept. To restore one, stop the server, copy the
backup file over `data.json`, and restart.

The app seeds itself with a handful of fictional example houses and a few
real, publicly-known Douglas County School District school names the first
time it runs, so you can see how everything works before entering your own
data. Just edit or delete the sample rows once you're ready.

## Sections

- **Dashboard** — a reminders banner (overdue/due today/due this week, with
  an optional opt-in browser notification), houses by status, upcoming
  showings/tours, overdue follow-ups, adjustable scoring weights (with
  save/apply named presets), top 5 houses, top 5 house+school combinations,
  a side-by-side house comparison table plus radar chart, and an
  Integrations status card (see below).
- **Houses** — full house details including offer tracking, tags, photos/
  documents per house, sortable/filterable, with a listing-URL link, a
  Print Report button, and an editable form per house.
- **Schools** — school details including CSPF rating, achievement/growth,
  enrollment method, waitlist status, and per-house distances.
- **Tasks** — to-dos linked to a house or school, with overdue rows in red
  and rows due within 7 days in amber.
- **Calendar** — month view of showings, tours, follow-ups, and task due
  dates, plus an Export Calendar (.ics) button.
- **Activity** — a running log of who added/edited/deleted what (set your
  name in the "Acting as" box in the header first).

Every table has an **Export CSV** button that downloads exactly the rows
currently shown (after your filters). House and School scores also show a
small sparkline of how that score has trended over time.

## Optional integrations

These are entirely opt-in — everything above works with zero configuration.

- **Geocoding** ("Geocode Address"/"Geocode School" buttons) works out of the
  box using the free OpenStreetMap Nominatim service (no account needed,
  just rate-limited). Once a house and some schools are geocoded, the
  "Suggest Nearby Schools" button on a house shows the closest school of
  each level by straight-line distance — a starting point to verify, **not**
  an authoritative DCSD boundary lookup (no public boundary API exists).
- **Live commute time** ("Refresh Commute Time" on a house) requires a
  Google Maps API key with the Geocoding and Distance Matrix APIs enabled.
  Set it via the `GEOCODE_API_KEY` environment variable before starting the
  server; without it, this button is disabled and manual entry keeps working
  as before. Set your commute destination address once in the Dashboard's
  Integrations card.
- **Import from Listing URL** (on a house, next to the Listing URL field)
  does a best-effort fetch of the page's Open Graph tags (title/description/
  price/image) for you to review and apply — many listing sites block this
  or don't expose useful tags, so treat results as a head start, not a
  guarantee.
- The app also registers as an installable PWA with an offline app-shell
  cache, so the UI itself loads instantly even on flaky home Wi-Fi (your
  actual house/school data still requires a live connection to load or save,
  since it's shared live between two people).

## About the scores

The app deliberately keeps three scores separate instead of combining them
into one number:

1. **House Score** — how good the house itself is (affordability, condition,
   commute, size), weighted by sliders you control.
2. **School Score** — how strong the assigned school is (CSPF rating,
   achievement, growth, transportation), weighted independently.
3. **Enrollment Probability** — how likely you are to actually get a seat
   (enrollment method, waitlist status), weighted independently again.

Click "How is this calculated?" (the small arrow under any score) to see the
exact factor values, normalization, weights, and contributions that produced
that number.
