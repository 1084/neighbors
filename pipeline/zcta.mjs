// Build data/zcta.json ({ "22314": [lat, lon], ... }) from the Census Bureau's ZCTA Gazetteer file.
// Source: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html (public domain).
// Run once, commit the result; re-run when a new Gazetteer vintage appears (yearly).
import { resolve } from "node:path";
import { DATA, USER_AGENT, writeJson, readJson, log } from "./lib/util.mjs";

const VINTAGE = process.env.ZCTA_VINTAGE || "2024";
const TARGET = resolve(DATA, "zcta.json");
if (process.argv.includes("--if-missing")) {
  const have = Object.keys(readJson(TARGET, {})).length;
  if (have >= 30000) { log(`data/zcta.json already has ${have} ZCTAs — skipping download`); process.exit(0); }
  log(`data/zcta.json has ${have} ZCTAs (need ~33,000) — downloading`);
}
const URL = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${VINTAGE}_Gazetteer/${VINTAGE}_Gaz_zcta_national.zip`;

log(`downloading ${URL}`);
const r = await fetch(URL, { headers: { "user-agent": USER_AGENT } });
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const zip = Buffer.from(await r.arrayBuffer());

// The archive holds one tab-separated text file; inflate it with Node's zlib (stored or deflated entry).
const { inflateRawSync } = await import("node:zlib");
const text = unzipSingle(zip);
const lines = text.split(/\r?\n/).filter(Boolean);
const header = lines[0].split("\t").map(s => s.trim());
const iZ = header.indexOf("GEOID"), iLat = header.indexOf("INTPTLAT"), iLon = header.indexOf("INTPTLONG");
const out = {};
for (const line of lines.slice(1)) {
  const c = line.split("\t");
  const z = c[iZ]?.trim(), lat = +c[iLat], lon = +c[iLon];
  if (z && Number.isFinite(lat) && Number.isFinite(lon)) out[z] = [+lat.toFixed(4), +lon.toFixed(4)];
}
writeJson(TARGET, out);
log(`wrote ${Object.keys(out).length} ZCTAs to data/zcta.json`);

function unzipSingle(buf) {
  // Local file header: signature 0x04034b50, compression at 8, sizes at 18/22, name len at 26, extra len at 28.
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = buf.readUInt16LE(8), csize = buf.readUInt32LE(18), nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const body = buf.subarray(start, start + csize);
  return (method === 8 ? inflateRawSync(body) : body).toString("utf8");
}
