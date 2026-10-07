import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA } from "../lib/util.mjs";
import { runFeed } from "../lib/guard.mjs";

const path = resolve(DATA, "feeds", "guardtest.json");
const items = n => Array.from({ length: n }, (_, i) => ({ id: `t:${i}` }));
test("a feed that shrinks by more than half keeps its committed output", async () => {
  mkdirSync(resolve(DATA, "feeds"), { recursive: true });
  writeFileSync(path, JSON.stringify({ feedId: "guardtest", items: items(20) }));
  const r = await runFeed("guardtest", async () => items(3));
  assert.equal(r.stale, true); assert.equal(r.count, 20); assert.equal(r.fetched, 3);
  const ok = await runFeed("guardtest", async () => items(18));
  assert.equal(ok.stale, false); assert.equal(ok.count, 18);
  const fail = await runFeed("guardtest", async () => { throw new Error("HTTP 403"); });
  assert.equal(fail.stale, true); assert.equal(fail.count, 18); assert.match(fail.error, /403/);
  rmSync(path); assert.ok(!existsSync(path));
});
