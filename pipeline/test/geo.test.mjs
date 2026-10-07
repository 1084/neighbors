import test from "node:test";
import assert from "node:assert/strict";
import { tileName, tilesFor, haversine } from "../lib/geo.mjs";

test("tile names use the south-west corner on a 2° grid, negatives included", () => {
  assert.equal(tileName(38.8, -77.05), "38_-78");
  assert.equal(tileName(41.14, -104.8), "40_-106");
  assert.equal(tileName(0.5, 0.5), "0_0");
});
test("tilesFor covers the radius in every direction", () => {
  const [lat, lon] = [38.8068, -77.0537];
  for (const r of [25, 50, 100]) {
    const tiles = tilesFor(lat, lon, r);
    const dLat = r / 69, dLon = r / (69 * Math.cos(lat * Math.PI / 180));
    for (const [la, lo] of [[lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]])
      assert.ok(tiles.includes(tileName(la, lo)), `${r} mi misses ${la},${lo}`);
  }
});
test("haversine: Alexandria to Richmond is about 95 miles", () => {
  const d = haversine(38.8068, -77.0537, 37.5407, -77.4360);
  assert.ok(d > 88 && d < 100, d);
});
