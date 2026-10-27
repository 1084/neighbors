import { test } from "node:test";
import assert from "node:assert/strict";
process.env.FIXTURES = "1";
const { default: usajobs, stateOf, payLine } = await import("../feeds/usajobs.mjs");

test("usajobs: places each duty station, drops remote/national postings", async () => {
  const items = await usajobs();
  assert.equal(items.length, 3); // 1 Richmond + 2 Forest Service stations; the remote IRS posting is dropped
  const r = items.find(i => i.place === "Richmond, VA");
  assert.equal(r.category, "work"); assert.equal(r.state, "VA"); assert.equal(r.lat, 37.5407);
  assert.match(r.title, /^Registered Nurse .* — Veterans Health Administration$/);
  assert.match(r.summary, /\$72,553–\$136,245 per year/);
  assert.equal(r.sourceName, "USAJOBS"); assert.ok(r.ends.startsWith("2026-11-14"));
  assert.ok(items.some(i => i.state === "WV"));
  assert.ok(!items.some(i => /Contact Representative/.test(i.title)));
  assert.equal(new Set(items.map(i => i.id)).size, 3);
});
test("usajobs: state and pay helpers", () => {
  assert.equal(stateOf({ CountrySubDivisionCode: "Virginia" }), "VA");
  assert.equal(stateOf({ CountrySubDivisionCode: "", LocationName: "Elkins, West Virginia" }), "WV");
  assert.equal(stateOf({ CountrySubDivisionCode: "", LocationName: "Anywhere in the U.S." }), null);
  assert.equal(payLine([{ MinimumRange: "18.5", MaximumRange: "24.1", RateIntervalCode: "PH" }]), "$19–$24 per hour");
  assert.equal(payLine([{ MinimumRange: "0", MaximumRange: "0", RateIntervalCode: "PA" }]), "");
});
