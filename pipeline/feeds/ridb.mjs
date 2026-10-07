// Recreation.gov RIDB: recreation areas across all federal agencies, as places.
// Docs: https://ridb.recreation.gov/docs — key from a Recreation.gov account. Public-domain data.
import { item, fetchJson, log } from "../lib/util.mjs";

const BASE = "https://ridb.recreation.gov/api/v1";

export default async function ridb() {
  const key = process.env.RIDB_API_KEY;
  if (!key && !process.env.FIXTURES) { log("ridb: RIDB_API_KEY not set, skipping"); return []; }
  const items = [];
  for (let offset = 0; offset < 10000; offset += 50) {
    const data = await fetchJson(`${BASE}/recareas?limit=50&offset=${offset}&activity=&lastupdated=`, { headers: { apikey: key || "" }, fixture: `ridb-recareas${offset ? "-" + offset : ""}.json` });
    const rows = data?.RECDATA || [];
    for (const r of rows) {
      if (!r.RecAreaLatitude || !r.RecAreaLongitude || r.Enabled === false) continue;
      items.push(item({
        id: `ridb:${r.RecAreaID}`, feedId: "ridb", category: "public-spaces",
        title: r.RecAreaName, summary: stripHtml(r.RecAreaDescription), starts: null, ends: null,
        lat: r.RecAreaLatitude, lon: r.RecAreaLongitude, place: r.RecAreaName, state: null,
        sourceUrl: `https://www.recreation.gov/search?q=${encodeURIComponent(r.RecAreaName)}`,
        sourceName: "Recreation.gov", updatedAt: r.LastUpdatedDate,
      }));
    }
    if (rows.length < 50 || process.env.FIXTURES) break;
  }
  return items;
}
const stripHtml = s => String(s || "").replace(/<[^>]+>/g, " ");
