// Prove the tile math: `node pipeline/tilecheck.mjs 22314 100` prints the point and the tiles the app would fetch.
import { zipPoint, tilesFor, haversine } from "./lib/geo.mjs";

const [zip = "22314", radius = "25"] = process.argv.slice(2);
const pt = zipPoint(zip);
if (!pt) { console.log(`${zip}: no ZCTA point (run npm run zcta?)`); process.exit(1); }
const tiles = tilesFor(pt[0], pt[1], +radius);
console.log(`${zip} → ${pt[0]}, ${pt[1]} · ${radius} mi → ${tiles.length} tile(s): ${tiles.join(" ")}`);
// sanity: the farthest corner of the fetched tiles must be at least `radius` away in every direction
const corners = tiles.flatMap(t => { const [la, lo] = t.split("_").map(Number); return [[la, lo], [la + 2, lo], [la, lo + 2], [la + 2, lo + 2]]; });
const reach = Math.min(...["N", "S", "E", "W"].map(dir => {
  const far = corners.filter(([la, lo]) => dir === "N" ? la > pt[0] : dir === "S" ? la < pt[0] : dir === "E" ? lo > pt[1] : lo < pt[1]);
  return Math.max(...far.map(([la, lo]) => dir === "N" || dir === "S" ? haversine(pt[0], pt[1], la, pt[1]) : haversine(pt[0], pt[1], pt[0], lo)));
}));
console.log(`coverage: at least ${reach.toFixed(0)} mi in every direction (${reach >= +radius ? "ok" : "SHORT"})`);
