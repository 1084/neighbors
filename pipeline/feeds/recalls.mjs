// Recalls: openFDA enforcement (food, drug, device) + CPSC SaferProducts. National items (no point).
// openFDA: https://open.fda.gov/apis/ (key optional, raises the limit). CPSC: https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information
import { item, fetchJson } from "../lib/util.mjs";

const DAYS = 45;
const yyyymmdd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const since = new Date(Date.now() - DAYS * 864e5);

export default async function recalls() {
  const items = [];
  const key = process.env.FDA_API_KEY ? `&api_key=${process.env.FDA_API_KEY}` : "";
  for (const kind of ["food", "drug", "device"]) {
    const url = `https://api.fda.gov/${kind}/enforcement.json?search=report_date:[${yyyymmdd(since)}+TO+${yyyymmdd(new Date())}]+AND+classification:("Class+I"+OR+"Class+II")&limit=100${key}`;
    const data = await fetchJson(url, { fixture: `fda-${kind}.json` }).catch(() => null);
    for (const r of data?.results || []) {
      const nationwide = /nationwide|all states|us\b|united states/i.test(r.distribution_pattern || "");
      items.push(item({
        id: `fda:${r.recall_number}`, feedId: "recalls", category: "public-safety",
        title: `${r.classification} ${kind} recall: ${firstWords(r.product_description, 10)}`,
        summary: r.reason_for_recall,
        starts: fdaDate(r.report_date), ends: null,
        lat: null, lon: null, place: nationwide ? "Nationwide" : (r.distribution_pattern || "").slice(0, 80),
        state: nationwide ? null : (r.state || null),
        sourceUrl: `https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=${encodeURIComponent(r.event_id || "")}`,
        sourceName: "U.S. Food and Drug Administration", updatedAt: fdaDate(r.report_date),
      }));
    }
  }
  const cpsc = await fetchJson(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${since.toISOString().slice(0, 10)}`, { fixture: "cpsc.json" }).catch(() => null);
  for (const r of cpsc || []) {
    items.push(item({
      id: `cpsc:${r.RecallID}`, feedId: "recalls", category: "public-safety",
      title: r.Title, summary: r.Hazards?.[0]?.Name || r.Description,
      starts: r.RecallDate, ends: null, lat: null, lon: null, place: "Nationwide", state: null,
      sourceUrl: r.URL, sourceName: "U.S. Consumer Product Safety Commission", updatedAt: r.LastPublishDate || r.RecallDate,
    }));
  }
  return items;
}
const fdaDate = s => s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
const firstWords = (s, n) => String(s || "").split(/\s+/).slice(0, n).join(" ");
