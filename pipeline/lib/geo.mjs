// Geography: ZCTA points, tiles, distance. Pure functions; shared by the pipeline and the viewer logic.
import { readJson, DATA } from "./util.mjs";
import { resolve } from "node:path";

export const TILE_DEG = 2;                       // 2° squares, named by their south-west corner
export const EARTH_MI = 3958.8;

export function tileName(lat, lon) {
  const la = Math.floor(lat / TILE_DEG) * TILE_DEG, lo = Math.floor(lon / TILE_DEG) * TILE_DEG;
  return `${la}_${lo}`;
}

/** Great-circle distance in miles. */
export function haversine(lat1, lon1, lat2, lon2) {
  const toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(a));
}

/** Names of every tile whose square intersects the circle (lat, lon, radiusMiles). */
export function tilesFor(lat, lon, radiusMiles) {
  const dLat = radiusMiles / 69.0;
  const dLon = radiusMiles / (69.0 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
  const names = new Set();
  const laMin = Math.floor((lat - dLat) / TILE_DEG) * TILE_DEG, laMax = Math.floor((lat + dLat) / TILE_DEG) * TILE_DEG;
  const loMin = Math.floor((lon - dLon) / TILE_DEG) * TILE_DEG, loMax = Math.floor((lon + dLon) / TILE_DEG) * TILE_DEG;
  for (let la = laMin; la <= laMax; la += TILE_DEG) for (let lo = loMin; lo <= loMax; lo += TILE_DEG) names.add(`${la}_${lo}`);
  return [...names];
}

let zctaCache = null;
/** { "22314": [38.81, -77.06], ... } from data/zcta.json (built by pipeline/zcta.mjs). */
export function zcta() {
  if (!zctaCache) zctaCache = readJson(resolve(DATA, "zcta.json"), {});
  return zctaCache;
}
/** Point for a ZIP; falls back to the nearest ZCTA sharing the first three digits (PO-box ZIPs have no ZCTA). */
export function zipPoint(zip) {
  const z = zcta(); const k = String(zip).padStart(5, "0");
  if (z[k]) return z[k];
  const prefix = k.slice(0, 3);
  const near = Object.keys(z).filter(x => x.startsWith(prefix)).sort((a, b) => Math.abs(+a - +k) - Math.abs(+b - +k))[0];
  return near ? z[near] : null;
}
