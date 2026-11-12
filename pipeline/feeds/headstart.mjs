// Head Start and Early Head Start centers: the Office of Head Start locator API (ACF, HHS).
// https://headstart.gov/developers/guide — one query per state returns every center with coordinates.
// No key documented for the center endpoint; HEADSTART_API_KEY is sent when set.
import { item, fetchJson, log, STATES } from "../lib/util.mjs";

const BASE = "https://headstart.gov/eclkc-apis/locator/center";

export default async function headstart() {
  const key = process.env.HEADSTART_API_KEY;
  const states = process.env.FIXTURES ? ["VA"] : [...STATES].filter(s => s.length === 2);
  const items = []; const seen = new Set(); let rows = 0;
  for (const st of states) {
    let data = null;
    try { data = await fetchJson(`${BASE}?state=${st}${key ? `&apikey=${key}` : ""}`, { fixture: `headstart-${st}.json` }); }
    catch (e) { if (!items.length && st === states[0]) throw e; log(`headstart ${st}: ${e.message}`); continue; }
    for (const c of data?.documents || data?.results || []) {
      rows++;
      const lat = +c.latitude, lon = +c.longitude; if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
      const id = c.id || c.centerId || `${lat.toFixed(4)},${lon.toFixed(4)}:${c.name}`; if (seen.has(id)) continue; seen.add(id);
      const addr = [c.addressLineOne, c.addressLineTwo].filter(Boolean).join(" ");
      const kinds = [c.headStart && "Head Start", c.earlyHeadStart && "Early Head Start", c.migrant && "Migrant", c.aian && "AIAN"].filter(Boolean).join(", ") || "Head Start";
      items.push(item({
        id: `headstart:${id}`, feedId: "headstart", category: "kids-and-family",
        title: c.name || c.program?.name || "Head Start center",
        summary: [kinds, addr, [c.city, c.state, c.zipFive].filter(Boolean).join(" "), c.phone || c.program?.phone, c.program?.name && `run by ${c.program.name}`].filter(Boolean).join(" · "),
        starts: null, ends: null, lat, lon,
        place: [c.city, c.state].filter(Boolean).join(", "), state: c.state || st,
        sourceUrl: c.program?.website || "https://headstart.gov/center-locator", sourceName: "Office of Head Start",
      }));
    }
  }
  log(`headstart: ${rows} rows → ${items.length} placed`);
  return items;
}
