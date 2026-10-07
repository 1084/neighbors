// National Weather Service active alerts → public-safety items, one per alert, placed at the centroid of its zones.
// Docs: https://www.weather.gov/documentation/services-web-api (free, User-Agent required, GeoJSON).
import { resolve } from "node:path";
import { fetchJson, item, readJson, writeJson, DATA, log, sleep } from "../lib/util.mjs";

const ZONE_CACHE = resolve(DATA, "cache", "nws-zones.json");

/** UGC zone code → [lat, lon] centroid, fetched once per zone and cached in the repo. */
async function zoneCentroid(ugc, cache) {
  if (cache[ugc] !== undefined) return cache[ugc];
  const type = ugc[2] === "C" ? "county" : "forecast";
  const z = await fetchJson(`https://api.weather.gov/zones/${type}/${ugc}`, { fixture: `nws-zone-${ugc}.json`, retries: 1 }).catch(() => null);
  cache[ugc] = z?.geometry ? centroid(z.geometry) : null;
  if (!process.env.FIXTURES) await sleep(150);
  return cache[ugc];
}
function centroid(geometry) {
  const pts = [];
  const walk = c => { if (!Array.isArray(c) || !c.length) return; if (typeof c[0] === "number") { if (c.length >= 2) pts.push(c); } else c.forEach(walk); };
  walk(geometry?.coordinates);
  if (!pts.length) return null;
  const [sx, sy] = pts.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return [+(sy / pts.length).toFixed(4), +(sx / pts.length).toFixed(4)];
}

export default async function nws() {
  const cache = readJson(ZONE_CACHE, {});
  const data = await fetchJson("https://api.weather.gov/alerts/active?status=actual&message_type=alert,update", { fixture: "nws-alerts.json" });
  const items = [];
  let firstError = null;
  for (const f of data?.features || []) try {
    const p = f.properties || {};
    if (!["Extreme", "Severe", "Moderate"].includes(p.severity)) continue;   // skip Minor/Unknown (routine advisories)
    let lat = null, lon = null;
    if (f.geometry) [lat, lon] = centroid(f.geometry) || [null, null];
    if (lat == null) for (const ugc of p.geocode?.UGC || []) { const c = await zoneCentroid(ugc, cache); if (c) { [lat, lon] = c; break; } }
    if (lat == null) continue;   // an alert we can't place is not shown (it would land in "national")
    const state = (p.geocode?.UGC?.[0] || "").slice(0, 2) || null;
    items.push(item({
      id: `nws:${p.id}`, feedId: "nws", category: "public-safety",
      title: p.event, summary: p.headline || p.description?.split("\n\n")[0],
      starts: p.onset || p.effective, ends: p.ends || p.expires,
      lat, lon, place: (p.areaDesc || "").split(";")[0], state,
      sourceUrl: p["@id"] || p.id, sourceName: p.senderName || "National Weather Service", updatedAt: p.sent,
    }));
  } catch (e) { firstError ||= `${f?.properties?.id || "?"}: ${e.message}`; }
  if (firstError) log(`nws: some alerts skipped; first error — ${firstError}`);
  writeJson(ZONE_CACHE, cache, true);
  log(`nws: ${items.length} significant alerts (${(data?.features || []).length} active)`);
  return items;
}
