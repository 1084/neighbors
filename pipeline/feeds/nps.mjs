// National Park Service: parks (as places), park alerts (closures, hazards) and upcoming events.
// Docs: https://www.nps.gov/subjects/developer/api-documentation.htm — key from https://www.nps.gov/subjects/developer/get-started.htm
import { item, fetchJson, log } from "../lib/util.mjs";

const BASE = "https://developer.nps.gov/api/v1";

async function paged(path, fixture, max = 2000) {
  const key = process.env.NPS_API_KEY;
  const all = [];
  for (let start = 0; start < max; start += 500) {
    const data = await fetchJson(`${BASE}/${path}${path.includes("?") ? "&" : "?"}limit=500&start=${start}&api_key=${key}`, { fixture: `${fixture}${start ? "-" + start : ""}.json` });
    const rows = data?.data || [];
    all.push(...rows);
    if (rows.length < 500 || process.env.FIXTURES) break;
  }
  return all;
}

export default async function nps() {
  if (!process.env.NPS_API_KEY && !process.env.FIXTURES) { log("nps: NPS_API_KEY not set, skipping"); return []; }
  const parks = await paged("parks?fields=addresses", "nps-parks");
  const byCode = Object.fromEntries(parks.map(p => [p.parkCode, p]));
  const items = [];
  for (const p of parks) {
    if (!p.latitude || !p.longitude) continue;
    items.push(item({
      id: `nps:park:${p.parkCode}`, feedId: "nps", category: "public-spaces",
      title: p.fullName, summary: p.description, starts: null, ends: null,
      lat: p.latitude, lon: p.longitude, place: p.designation || "National Park Service", state: (p.states || "").split(",")[0],
      sourceUrl: p.url, sourceName: "National Park Service",
    }));
  }
  const alerts = await paged("alerts", "nps-alerts");
  for (const a of alerts) {
    const p = byCode[a.parkCode]; if (!p?.latitude) continue;
    items.push(item({
      id: `nps:alert:${a.id}`, feedId: "nps", category: "public-safety",
      title: `${p.fullName}: ${a.title}`, summary: a.description, starts: a.lastIndexedDate, ends: null,
      lat: p.latitude, lon: p.longitude, place: p.fullName, state: (p.states || "").split(",")[0],
      sourceUrl: a.url || p.url, sourceName: "National Park Service", updatedAt: a.lastIndexedDate,
    }));
  }
  const events = await paged("events?dateStart=" + new Date().toISOString().slice(0, 10), "nps-events");
  for (const e of events) {
    const p = byCode[e.parkcode || e.parkCode]; const lat = +e.latitude || p?.latitude, lon = +e.longitude || p?.longitude;
    if (!lat || !lon) continue;
    const day = e.dates?.[0] || e.datestart;
    items.push(item({
      id: `nps:event:${e.id}`, feedId: "nps", category: "public-spaces",
      title: e.title, summary: stripHtml(e.description), starts: day ? `${day}T${e.times?.[0]?.timestart || "09:00"}:00` : null,
      ends: day ? `${day}T${e.times?.[0]?.timeend || "17:00"}:00` : null,
      lat, lon, place: e.location || p?.fullName, state: (p?.states || "").split(",")[0],
      sourceUrl: e.infourl || p?.url, sourceName: "National Park Service",
    }));
  }
  return items;
}
const stripHtml = s => String(s || "").replace(/<[^>]+>/g, " ");
