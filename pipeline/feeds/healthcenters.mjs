// Community health centers: HRSA Health Center Program service delivery and look-alike sites
// (refreshed daily, ~15k sites, public domain). https://data.hrsa.gov/data/download
// Column names come from the file's own header; the HRSA download uses long descriptive names,
// so lookups below tolerate either the long form or a short alias.
import { item, log } from "../lib/util.mjs";
import { fetchCached, parseCsv, phone, titleCase } from "../lib/files.mjs";

const URL = "https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv";
const col = (r, ...names) => { for (const n of names) { const k = Object.keys(r).find(h => h.replace(/\s+/g, " ") === n.toUpperCase()); if (k !== undefined) return r[k]; } return ""; };

export default async function healthcenters() {
  const buf = await fetchCached(URL, "hrsa-sites.csv", { fixture: "hrsa-sites.csv" });
  const rows = parseCsv(buf);
  const items = []; let i = 0;
  for (const r of rows) {
    const lat = +col(r, "Geocoding Artifact Address Primary Y Coordinate", "Y", "Latitude"), lon = +col(r, "Geocoding Artifact Address Primary X Coordinate", "X", "Longitude");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const status = col(r, "Site Status Description", "Site Status"); if (status && !/^active/i.test(status)) continue;
    const name = col(r, "Site Name"); if (!name) continue;
    const st = col(r, "Site State Abbreviation", "State");
    const id = col(r, "BHCMIS Organization Identification Number", "Health Center Site Identification Number", "Site ID") || `${i++}`;
    const hours = col(r, "Operating Hours per Week");
    items.push(item({
      id: `hrsa:${id}:${lat.toFixed(4)},${lon.toFixed(4)}`, feedId: "healthcenters", category: "health",
      title: titleCase(name),
      summary: [col(r, "Site Type Description", "Site Type"), col(r, "Site Address") && titleCase(col(r, "Site Address")), [titleCase(col(r, "Site City")), st, col(r, "Site Postal Code").slice(0, 5)].filter(Boolean).join(" "), phone(col(r, "Site Telephone Number")), +hours > 0 && `${hours} hours a week`, col(r, "Health Center Name") && `part of ${titleCase(col(r, "Health Center Name"))}`].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [titleCase(col(r, "Site City")), st].filter(Boolean).join(", "), state: st,
      sourceUrl: col(r, "Site Web Address") ? (/^https?:/.test(col(r, "Site Web Address")) ? col(r, "Site Web Address") : `https://${col(r, "Site Web Address")}`) : "https://findahealthcenter.hrsa.gov/", sourceName: "HRSA Find a Health Center",
    }));
  }
  log(`healthcenters: ${rows.length} rows → ${items.length} placed`);
  return items;
}
