import { test } from "node:test";
import assert from "node:assert/strict";
process.env.FIXTURES = "1";
const { parseIcal, icalDate } = await import("../lib/ical.mjs");
const { default: libevents } = await import("../feeds/libevents.mjs");
const { default: headstart } = await import("../feeds/headstart.mjs");
const { default: ssa } = await import("../feeds/ssa.mjs");
const { default: vafacilities } = await import("../feeds/vafacilities.mjs");

test("ical: folded lines, DATE vs local TZID vs UTC, GEO, escapes", () => {
  const ev = parseIcal("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:A\\, b\nDTSTART;TZID=America/New_York:20260115T090000\nGEO:38.8;-77.0\nDESCRIPTION:line one\n  continued\nEND:VEVENT\nEND:VCALENDAR");
  assert.equal(ev.length, 1); assert.equal(ev[0].SUMMARY, "A, b"); assert.equal(ev[0].DTSTART.iso, "2026-01-15T14:00:00.000Z"); // EST = UTC-5
  assert.deepEqual(ev[0].GEO, [38.8, -77.0]); assert.equal(ev[0].DESCRIPTION, "line one continued");
  assert.equal(icalDate("20260701T090000", { TZID: "America/New_York" }).iso, "2026-07-01T13:00:00.000Z"); // EDT = UTC-4
  assert.equal(icalDate("20260701").allDay, true); assert.equal(icalDate("20260701T120000Z").iso, "2026-07-01T12:00:00.000Z");
});

test("libevents: kids events under kids-and-family, closures and online dropped, Communico GEO used", async () => {
  const items = await libevents();
  const titles = items.map(i => i.title);
  assert.ok(titles.includes("1000 Books Story Time")); assert.ok(!titles.some(t => /Closed/.test(t))); assert.ok(!titles.includes("Resume Workshop"));
  const alx = items.find(i => i.title === "1000 Books Story Time"); assert.equal(alx.category, "kids-and-family"); assert.equal(alx.lat, 38.807858); assert.equal(alx.sourceName, "Alexandria Library");
});

test("headstart: placed with program, zero coords dropped", async () => {
  const items = await headstart(); assert.equal(items.length, 1); assert.equal(items[0].category, "kids-and-family"); assert.match(items[0].summary, /Head Start · 1200 N Quaker Ln/);
});

test("ssa: placed at ZIP centroid, hours collapsed or listed", async () => {
  const items = await ssa(); const alx = items.find(i => i.id === "ssa:B23"); assert.ok(alx); assert.equal(alx.category, "public-services");
  assert.match(alx.summary, /Suite 100, 5510 Cherokee Ave · Alexandria VA 22312/); assert.match(alx.summary, /Wed 9:00 AM–12:00 PM/);
  const hen = items.find(i => i.id === "ssa:A00"); assert.match(hen.summary, /9:00 AM–4:00 PM Mon–Fri/);
});

test("vafacilities: health vs benefits categories, address and phone", async () => {
  const items = await vafacilities(); assert.equal(items.length, 2);
  assert.equal(items.find(i => i.id === "va:vha_688").category, "health"); assert.equal(items.find(i => i.id === "va:vba_372").category, "public-services");
  assert.match(items[0].summary, /50 Irving Street, Northwest · Washington DC 20422 · 202-745-8000/);
});
