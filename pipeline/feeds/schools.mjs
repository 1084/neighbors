// Public schools: NCES EDGE geocoded public school file (annual, ~100k schools, public domain).
// https://nces.ed.gov/programs/edge/Geographic/SchoolLocations — the file carries each school's
// address geocode; phone/website live in the separate CCD directory and are not included.
import { item, log } from "../lib/util.mjs";
import { fetchCached, zipEntries, parseCsv, parseDbf, titleCase } from "../lib/files.mjs";

const YEAR = process.env.NCES_YEAR || "2425";
const URL = `https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_${YEAR}.zip`;

export default async function schools() {
  const buf = await fetchCached(URL, `nces-publicsch-${YEAR}.zip`, { fixture: "nces-publicsch.zip" });
  const zip = zipEntries(buf);
  // The 2024-25 archive holds EDGE_GEOCODE_PUBLICSCH_2425.TXT (tab-delimited), an .xlsx, a SAS file
  // and a nested Shapefile_SCH.zip. Prefer the .TXT; fall back to a .csv or the shapefile's .dbf.
  const rows = zip.names.some(n => /\.(txt|csv)$/i.test(n)) ? parseCsv(zip.read(/\.(txt|csv)$/i))
    : zip.names.some(n => /\.dbf$/i.test(n)) ? parseDbf(zip.read(/\.dbf$/i))
    : zip.names.some(n => /shapefile.*\.zip$/i.test(n)) ? parseDbf(zipEntries(zip.read(/shapefile.*\.zip$/i)).read(/\.dbf$/i))
    : (() => { throw new Error(`no .txt/.csv/.dbf in archive; entries: ${zip.names.join(", ")}`); })();
  const items = [];
  const first = rows[0] || {};
  log(`schools: ${rows.length} rows; columns: ${Object.keys(first).slice(0, 30).join(", ")}`);
  const pick = (r, ...names) => { for (const n of names) if (r[n] !== undefined && r[n] !== "") return r[n]; return ""; };
  for (const r of rows) {
    const lat = +pick(r, "LAT", "LATCOD", "LATITUDE", "Y"), lon = +pick(r, "LON", "LONCOD", "LONGITUDE", "X");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const id = pick(r, "NCESSCH", "NCESSCH_ID", "SCHID"); if (!id) continue;
    items.push(item({
      id: `nces:${id}`, feedId: "schools", category: "education",
      title: titleCase(r.NAME),
      summary: [r.STREET && titleCase(r.STREET), [titleCase(r.CITY), r.STATE, r.ZIP].filter(Boolean).join(" "), r.NMCNTY && `${titleCase(r.NMCNTY)}`].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [titleCase(r.CITY), r.STATE].filter(Boolean).join(", "), state: r.STATE,
      sourceUrl: `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${id}`, sourceName: "NCES Common Core of Data",
    }));
  }
  log(`schools: ${rows.length} rows → ${items.length} placed${items.length === 0 && rows.length ? ` — first row: ${JSON.stringify(first).slice(0, 300)}` : ""}`);
  return items;
}
