// Public schools: NCES EDGE geocoded public school file (annual, ~100k schools, public domain).
// https://nces.ed.gov/programs/edge/Geographic/SchoolLocations — the file carries each school's
// address geocode; phone/website live in the separate CCD directory and are not included.
import { item, log } from "../lib/util.mjs";
import { fetchCached, zipEntries, parseCsv, parseDbf, titleCase } from "../lib/files.mjs";

const YEAR = process.env.NCES_YEAR || "2425";
const URL = `https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_${YEAR}.zip`;

// The layout above is a best guess at field order; confirm it against the data itself.
// NCESSCH is the first 12-digit field; LAT/LON are the first pair of signed decimals with |lat|<=72, lon<0.
function fitLayout(rows, layout) {
  const r0 = rows[0]; if (!r0) return rows;
  const vals = layout.map(k => r0[k]);
  const iId = vals.findIndex(v => /^\d{12}$/.test(v));
  const iLat = vals.findIndex((v, i) => /^-?\d+\.\d+$/.test(v) && Math.abs(+v) <= 72 && /^-\d+\.\d+$/.test(vals[i + 1] || ""));
  if (iId < 0 || iLat < 0) { log(`schools: could not fit layout; first row: ${JSON.stringify(vals).slice(0, 300)}`); return rows; }
  if (layout[iId] === "NCESSCH" && layout[iLat] === "LAT") return rows;
  // remap by position: ID, then NAME is ID+2, STREET..ZIP follow, NMCNTY before LAT
  const map = { [layout[iId]]: "NCESSCH", [layout[iId + 1]]: "LEAID", [layout[iId + 2]]: "NAME", [layout[iId + 3]]: "OPSTFIPS", [layout[iId + 4]]: "STREET", [layout[iId + 5]]: "CITY", [layout[iId + 6]]: "STATE", [layout[iId + 7]]: "ZIP", [layout[iLat - 1]]: "NMCNTY", [layout[iLat]]: "LAT", [layout[iLat + 1]]: "LON" };
  log(`schools: remapped layout by content (id at ${iId}, lat at ${iLat})`);
  return rows.map(r => { const o = {}; for (const [k, v] of Object.entries(r)) o[map[k] || k] = v; return o; });
}

export default async function schools() {
  const buf = await fetchCached(URL, `nces-publicsch-${YEAR}.zip`, { fixture: "nces-publicsch.zip" });
  const zip = zipEntries(buf);
  // The 2024-25 archive holds EDGE_GEOCODE_PUBLICSCH_2425.TXT (tab-delimited), an .xlsx, a SAS file
  // and a nested Shapefile_SCH.zip. Prefer the .TXT; fall back to a .csv or the shapefile's .dbf.
  // The .TXT has NO header row. Layout (EDGE_GEOCODE_PUBLIC_TECHDOC, with the two leading
  // export columns the 2024-25 file carries): X, OBJECTID, then the documented record.
  const LAYOUT = ["X", "OBJECTID", "SURVYEAR_N", "LEAID_N", "SCHID_N", "NCESSCH", "LEAID", "NAME", "OPSTFIPS", "STREET", "CITY", "STATE", "ZIP", "NMCNTY", "LAT", "LON", "CITY2", "STATE2", "LOCALE_TXT", "LOCALE_TXT2", "CBSA", "NMCBSA", "CBSATYPE", "CSA", "NMCSA", "NECTA", "NMNECTA", "CD", "SLDL", "SLDU", "SCHOOLYEAR"];
  const txt = zip.names.some(n => /\.(txt|csv)$/i.test(n)) ? zip.read(/\.(txt|csv)$/i) : null;
  const headerless = txt && /^\d+\t\d+\t/.test(txt.subarray(0, 64).toString("utf8"));
  const rows = txt ? (headerless ? fitLayout(parseCsv(txt, { header: LAYOUT }), LAYOUT) : parseCsv(txt))
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
