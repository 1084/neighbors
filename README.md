# Neighbors — data pipeline

Official civic feeds, normalized to one shape and tiled so a phone can answer "what's happening within 25, 50 or 100 miles of my ZIP" without ever sending the ZIP anywhere. Companion to [Open Chambers](https://johnhubert.llc/openchambers/) and built on the same spine: a nightly GitHub Action writes static JSON into `docs/data/`, served by GitHub Pages at https://johnhubert.llc/neighbors/.

Read `CHARTER.md` first. It is short and it decides everything else.

```
neighbors/
  CHARTER.md            the rules (never a marketplace, no voice, official sources only)
  SOURCES.md            every feed, its key, its terms, and the date they were read
  docs/schema.md        the item shape and the tile layout
  docs/index.html       the web viewer (also the pipeline's test harness)
  docs/data/            built output: tiles/*.json, tiles/index.json, zcta.json
  data/zcta.json        ZIP → point, from the Census ZCTA Gazetteer (npm run zcta)
  data/feeds/*.json     each feed's last good output (the regression guard's memory)
  data/cache/           geocode caches (NWS zone centroids)
  pipeline/build.mjs    the orchestrator; pipeline/feeds/*.mjs one adapter per source
  pipeline/fixtures/    feed-shaped samples; FIXTURES=1 runs the whole pipeline offline
```

## Runbook

### 1. Keys (once)

| Secret | Where to get it | Needed by |
| --- | --- | --- |
| `NPS_API_KEY` | https://www.nps.gov/subjects/developer/get-started.htm (free form) | nps |
| `RIDB_API_KEY` | Recreation.gov account → profile → API key | ridb |
| `USDA_API_KEY` | https://www.usdalocalfoodportal.com/fe/fregisterpublicapi/ | usda |
| `GOOGLE_CIVIC_KEY` | Google Cloud console → enable Civic Information API → credentials | civic |
| `FDA_API_KEY` | https://open.fda.gov/apis/authentication/ (optional; raises the limit) | recalls |

NWS needs no key; the pipeline sends the `User-Agent` in `pipeline/lib/util.mjs`. Add each key under GitHub → Settings → Secrets and variables → Actions. A feed whose key is missing is skipped, not failed, so the pipeline runs with whatever keys exist.

Read each provider's terms page when you register and put the date in `SOURCES.md`.

### 2. First build

Push the repo (public: GitHub Pages needs it, and nothing in here is secret), turn on Pages for the `docs/` folder, then Actions → **data** → Run workflow. The first run downloads the Census ZCTA Gazetteer (about 33,000 ZIPs) and commits `data/zcta.json`; later runs reuse it. Open the Actions log and check every feed's count line.

### 3. Every night

The workflow runs at 07:23 UTC, builds, and commits `data/` and `docs/data/`. A feed that fails or returns fewer than half its committed items keeps its last good output and is listed under `stale` in `docs/data/tiles/index.json`; the viewer shows that in its status line.

### 4. Local

```sh
npm test                 # geo + regression-guard tests
npm run build:fixtures   # whole pipeline against pipeline/fixtures, no network
npm run tiles 22314 100  # which tiles a ZIP + radius fetches, and the coverage check
npm run zcta             # rebuild data/zcta.json from the Census file (needs network)
npm run build            # the real thing (needs network + keys in the environment)
cd docs && python3 -m http.server 8080   # then open http://localhost:8080/
```

The feed hosts are not reachable from Claude's workspace, so adapters were written against each provider's documented response shape and the fixtures mirror those shapes. The first real run in Actions is where a shape difference shows up: read that log, fix the adapter, re-run.

## Adding a feed

One file in `pipeline/feeds/`, exporting an async function that returns an array of `item({...})` objects (see `docs/schema.md`), registered in `build.mjs`, with a fixture and a row in `SOURCES.md`. The `item()` helper rejects unknown categories and any price field.

## Not here

Live weather and air quality (served by the Worker, hourly), the contribution queue, push, and the iPhone app live in their own repos. AMBER and other IPAWS alerts wait on the FEMA agreement.

© 2026 John Hubert LLC
