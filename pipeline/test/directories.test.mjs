import { test } from "node:test";
import assert from "node:assert/strict";
process.env.FIXTURES = "1";
const { parseCsv, phone, titleCase } = await import("../lib/files.mjs");

test("csv parser handles quotes, CRLF and BOM", () => {
  const rows = parseCsv('﻿A,B\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
  assert.deepEqual(rows, [{ A: "x, y", B: 'he said "hi"' }, { A: "1", B: "2" }]);
  assert.equal(phone("7033391810"), "(703) 339-1810"); assert.equal(phone("12"), "");
  assert.equal(titleCase("WEST POTOMAC HIGH"), "West Potomac High");
});
test("schools: placed from the EDGE zip, no-coord rows dropped", async () => {
  const items = await (await import("../feeds/schools.mjs")).default();
  assert.equal(items.length, 2); const h = items.find(i => /Hayfield/.test(i.title));
  assert.equal(h.category, "education"); assert.equal(h.state, "VA"); assert.equal(h.lat, 38.7605); assert.match(h.summary, /Fairfax County/);
});
test("libraries: outlet file inside the zip, books-by-mail skipped, hours summarised", async () => {
  const items = await (await import("../feeds/libraries.mjs")).default();
  assert.equal(items.length, 2); const k = items.find(i => /Kingstowne/.test(i.title));
  assert.match(k.summary, /Branch library/); assert.match(k.summary, /\(703\) 339-1810/); assert.match(k.summary, /about 58 hours a week/);
});
test("healthcenters: long HRSA headers, inactive sites dropped, website normalised", async () => {
  const items = await (await import("../feeds/healthcenters.mjs")).default();
  assert.equal(items.length, 1); assert.equal(items[0].category, "health"); assert.equal(items[0].sourceUrl, "https://www.neighborhoodhealthva.org"); assert.match(items[0].summary, /50 hours a week/);
});
test("hospitals: placed by ZIP centroid, unplaceable dropped", async () => {
  const items = await (await import("../feeds/hospitals.mjs")).default();
  assert.equal(items.length, 1); assert.match(items[0].title, /Inova Mount Vernon/); assert.match(items[0].summary, /Emergency services/); assert.ok(Math.abs(items[0].lat - 38.75) < 0.2);
});
