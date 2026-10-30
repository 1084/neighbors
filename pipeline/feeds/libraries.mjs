// Public libraries: IMLS Public Libraries Survey outlet file (annual, ~17k outlets, public domain).
// https://www.imls.gov/research-evaluation/data-collection/public-libraries-survey
// Set IMLS_ZIP_URL to the current fiscal year's CSV zip; the outlet file inside is matched by name.
import { item, log } from "../lib/util.mjs";
import { fetchCached, zipEntries, parseCsv, phone, titleCase } from "../lib/files.mjs";

const URL = process.env.IMLS_ZIP_URL || "https://www.imls.gov/sites/default/files/2024-06/pls_fy2022_csv.zip";
const TYPE = { CE: "Central library", BR: "Branch library", BS: "Bookmobile", BM: "Books-by-mail service" };

export default async function libraries() {
  const buf = await fetchCached(URL, "imls-pls.zip", { fixture: "imls-pls.zip" });
  const zip = zipEntries(buf);
  const rows = parseCsv(zip.read(/outlet.*\.csv$/i));
  const items = [];
  for (const r of rows) {
    const lat = +(r.LATITUDE ?? r.LAT), lon = +(r.LONGITUD ?? r.LONGITUDE ?? r.LON);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const type = TYPE[r.C_OUT_TY] || "Library";
    if (r.C_OUT_TY === "BM") continue; // no place to visit
    const hours = +r.HOURS, weeks = +r.WKS_OPEN;
    const open = hours > 0 && weeks > 0 ? `open about ${Math.round(hours / weeks)} hours a week` : "";
    items.push(item({
      id: `imls:${r.FSCSKEY}-${r.FSCS_SEQ}`, feedId: "libraries", category: "education",
      title: titleCase(r.LIBNAME),
      summary: [type, r.ADDRESS && titleCase(r.ADDRESS), [titleCase(r.CITY), r.STABR, String(r.ZIP).padStart(5, "0")].filter(Boolean).join(" "), phone(r.PHONE), open].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [titleCase(r.CITY), r.STABR].filter(Boolean).join(", "), state: r.STABR,
      sourceUrl: "https://www.imls.gov/search-compare/", sourceName: "IMLS Public Libraries Survey",
    }));
  }
  log(`libraries: ${rows.length} outlets → ${items.length} placed`);
  return items;
}
