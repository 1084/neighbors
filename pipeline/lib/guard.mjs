// Regression guard: a feed that comes back much smaller than its committed output is treated as an outage.
// (Lesson from the Senate 403 day: a bad run must never publish an empty feed.)
import { resolve } from "node:path";
import { DATA, readJson, writeJson, log } from "./util.mjs";

const RATIO = 0.5;   // keep the old file if the new run has fewer than half the items
const MIN_OLD = 5;   // tiny feeds can legitimately swing; don't guard below this many

export async function runFeed(feedId, fn) {
  const path = resolve(DATA, "feeds", `${feedId}.json`);
  const committed = readJson(path, null);
  const old = committed?.items || [];
  try {
    const items = await fn();
    if (old.length >= MIN_OLD && items.length < old.length * RATIO) {
      log(`${feedId}: ${items.length} items vs ${old.length} committed — keeping committed (stale)`);
      return { feedId, items: old, stale: true, count: old.length, fetched: items.length };
    }
    writeJson(path, { feedId, fetchedAt: new Date().toISOString(), items });
    log(`${feedId}: ${items.length} items`);
    return { feedId, items, stale: false, count: items.length, fetched: items.length };
  } catch (e) {
    log(`${feedId} FAILED: ${e.message} — keeping committed (${old.length})`);
    return { feedId, items: old, stale: true, count: old.length, fetched: 0, error: e.message };
  }
}
