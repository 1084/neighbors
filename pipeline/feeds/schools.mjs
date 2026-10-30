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
  // NCES ships xlsx + SAS + shapefile; the shapefile's .dbf is the same table and needs no library
  const rows = zip.names.some(n => /\.dbf$/i.test(n)) ? parseDbf(zip.read(/\.dbf$/i))
    : zip.names.some(n => /\.csv$/i.test(n)) ? parseCsv(zip.read(/\.csv$/i))
    : (() => { throw new Error(`no .dbf or .csv in archive; entries: ${zip.names.join(", ")}`); })();
  const items = [];
  for (const r of rows) {
    const lat = +r.LAT, lon = +r.LON;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const id = r.NCESSCH; if (!id) continue;
    items.push(item({
      id: `nces:${id}`, feedId: "schools", category: "education",
      title: titleCase(r.NAME),
      summary: [r.STREET && titleCase(r.STREET), [titleCase(r.CITY), r.STATE, r.ZIP].filter(Boolean).join(" "), r.NMCNTY && `${titleCase(r.NMCNTY)}`].filter(Boolean).join(" · "),
      starts: null, ends: null, lat, lon,
      place: [titleCase(r.CITY), r.STATE].filter(Boolean).join(", "), state: r.STATE,
      sourceUrl: `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${id}`, sourceName: "NCES Common Core of Data",
    }));
  }
  log(`schools: ${rows.length} rows → ${items.length} placed`);
  return items;
}
