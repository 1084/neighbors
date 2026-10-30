// Hospitals: CMS Hospital General Information (Provider Data Catalog, ~5,400 hospitals, public domain).
// https://data.cms.gov/provider-data/dataset/xubh-q36u — JSON datastore API, paged. The file has
// no coordinates, so each hospital is placed at its ZIP's centroid (good enough for a 25-mile radius).
import { item, fetchJson, log } from "../lib/util.mjs";
import { zipPoint } from "../lib/geo.mjs";
import { phone, titleCase } from "../lib/files.mjs";

const BASE = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";
const PAGE = 1000;

export default async function hospitals() {
  const items = []; let offset = 0, total = Infinity, seen = 0, unplaced = 0;
  while (offset < total) {
    const data = await fetchJson(`${BASE}?limit=${PAGE}&offset=${offset}&count=true`, { fixture: `cms-hospitals${offset ? "-" + offset : ""}.json` });
    const rows = data?.results || [];
    total = +data?.count || rows.length;
    for (const r of rows) {
      seen++;
      const zip = String(r.zip_code || "").slice(0, 5); const pt = zipPoint(zip);
      if (!pt) { unplaced++; continue; }
      const er = /^y/i.test(r.emergency_services || "") ? "Emergency services" : "";
      items.push(item({
        id: `cms:${r.facility_id}`, feedId: "hospitals", category: "health",
        title: titleCase(r.facility_name),
        summary: [r.hospital_type, er, r.address && titleCase(r.address), [titleCase(r.citytown), r.state, zip].filter(Boolean).join(" "), phone(r.telephone_number), r.hospital_ownership && String(r.hospital_ownership).replace(/^Government - /, "")].filter(Boolean).join(" · "),
        starts: null, ends: null, lat: pt[0], lon: pt[1],
        place: [titleCase(r.citytown), r.state].filter(Boolean).join(", "), state: r.state,
        sourceUrl: `https://www.medicare.gov/care-compare/details/hospital/${r.facility_id}`, sourceName: "CMS Care Compare",
      }));
    }
    if (rows.length < PAGE || process.env.FIXTURES) break;
    offset += PAGE;
  }
  log(`hospitals: ${seen} hospitals → ${items.length} placed by ZIP (${unplaced} unplaced)`);
  return items;
}
