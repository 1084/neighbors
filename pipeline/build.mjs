// Neighbors — data pipeline.
// Pulls official feeds, normalizes them to one item shape (docs/schema.md), and writes tiles into docs/data/.
// Runs nightly in GitHub Actions (.github/workflows/data.yml) or locally: `npm run build`.
// `npm run build:fixtures` runs the same code against pipeline/fixtures/ with no network.
//
// Feeds (see SOURCES.md): nws, recalls (no key) · nps, ridb, usda, civic (key in env; skipped when absent).
// AirNow is hourly data and is served live by the Worker, not here.
// A feed that fails or shrinks by half keeps its committed output (pipeline/lib/guard.mjs).

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { DATA, OUT, log, writeJson } from "./lib/util.mjs";
import { runFeed } from "./lib/guard.mjs";
import { writeTiles } from "./lib/tiles.mjs";
import nws from "./feeds/nws.mjs";
import recalls from "./feeds/recalls.mjs";
import nps from "./feeds/nps.mjs";
import ridb from "./feeds/ridb.mjs";
import usda from "./feeds/usda.mjs";
import civic from "./feeds/civic.mjs";

if (!existsSync(resolve(DATA, "zcta.json"))) {
  log("data/zcta.json missing — run `npm run zcta` first (downloads the Census ZCTA Gazetteer)");
  process.exit(1);
}

const FEEDS = { nws, recalls, nps, ridb, usda, civic };
const only = process.env.FEEDS ? process.env.FEEDS.split(",") : Object.keys(FEEDS);

const results = [];
for (const id of only) {
  if (!FEEDS[id]) { log(`unknown feed ${id}`); continue; }
  results.push(await runFeed(id, FEEDS[id]));
}

// Drop items whose window ended more than a day ago; keep undated places.
const cutoff = Date.now() - 864e5;
const items = results.flatMap(r => r.items).filter(it => !it.ends || Date.parse(it.ends) > cutoff);

const index = writeTiles(items, {
  stale: results.filter(r => r.stale).map(r => r.feedId),
  feeds: Object.fromEntries(results.map(r => [r.feedId, { count: r.count, fetched: r.fetched, stale: r.stale, error: r.error || null }])),
});

// The viewer and the app read a compact ZIP → point table from the same place as the tiles.
writeJson(resolve(OUT, "zcta.json"), (await import("./lib/geo.mjs")).zcta());

log(`done: ${items.length} items in ${Object.keys(index.tiles).length} tiles; stale: ${index.stale.join(", ") || "none"}`);
if (index.stale.length && process.env.CI) console.log(`::warning::stale feeds: ${index.stale.join(", ")}`);
