// Bucket items into tile files and write the index.
import { resolve } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { OUT, writeJson, log } from "./util.mjs";
import { tileName } from "./geo.mjs";

export function writeTiles(items, { stale = [], feeds = {} } = {}) {
  const dir = resolve(OUT, "tiles");
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const buckets = new Map();
  const put = (name, it) => { if (!buckets.has(name)) buckets.set(name, []); buckets.get(name).push(it); };
  for (const it of items) {
    if (it.lat != null && it.lon != null) put(tileName(it.lat, it.lon), it);
    else if (it.state) put(`state-${it.state}`, it);
    else put("national", it);
  }
  const index = { builtAt: new Date().toISOString(), tileDeg: 2, items: items.length, feeds, stale, tiles: {} };
  for (const [name, list] of buckets) {
    list.sort((a, b) => (a.starts || "9").localeCompare(b.starts || "9") || a.title.localeCompare(b.title));
    writeJson(resolve(dir, `${name}.json`), list);
    index.tiles[name] = list.length;
  }
  writeJson(resolve(dir, "index.json"), index, true);
  log(`tiles: ${buckets.size} files, ${items.length} items`);
  return index;
}
