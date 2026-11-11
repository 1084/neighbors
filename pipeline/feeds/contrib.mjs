// Contributions approved on the review page (worker/), committed by the queue to data/contrib/approved.json.
//
// Two kinds land here:
//   item    one event or notice with its official link: shown as an item at its ZIP, in its category
//   source  a calendar or feed page from an institution: shown as one pointer item ("X publishes a calendar
//           of events; open it at the source") at its ZIP, until an adapter is written for it. A source that
//           gets its own adapter should be removed from approved.json in the same commit.
// Nothing here is written by the submitter: the title is the page's own, the link is the page, and the
// summary is a fixed sentence. Items with a date keep it; a past date drops the item.

import { resolve } from "node:path";
import { DATA, item, readJson, log } from "../lib/util.mjs";
import { zipPoint } from "../lib/geo.mjs";

const CATS = new Set(["governance", "elections", "public-spaces", "public-services", "volunteering", "public-safety", "work", "education", "health", "kids-and-family"]);

export default async function contrib() {
  const list = readJson(resolve(DATA, "contrib/approved.json"), []);
  const items = []; let skipped = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const c of Array.isArray(list) ? list : []) {
    const pt = c.zip ? zipPoint(c.zip) : null;
    const cat = CATS.has(c.category) ? c.category : "public-services";
    if (!pt || !c.link) { skipped++; continue; }
    const [lat, lon] = pt;
    if (c.kind === "item") {
      if (c.starts && c.starts.slice(0, 10) < today) { skipped++; continue; }
      items.push(item({ id: `contrib:${c.id}`, feedId: "contrib", category: cat, title: c.title || c.domain,
        summary: c.note || `Added by a neighbor. Details at the source.`, starts: c.starts || null, ends: null, lat, lon, place: `ZIP ${c.zip}`, state: null,
        sourceUrl: c.link, sourceName: c.domain, updatedAt: c.approvedAt }));
    } else if (c.kind === "source") {
      items.push(item({ id: `contrib:${c.id}`, feedId: "contrib", category: cat, title: c.title ? `${c.title}: events and notices` : `${c.domain}: events and notices`,
        summary: c.note || `A calendar a neighbor pointed us to. Open it at the source for what's on.`, starts: null, ends: null, lat, lon, place: `ZIP ${c.zip}`, state: null,
        sourceUrl: c.link, sourceName: c.title || c.domain, updatedAt: c.approvedAt }));
    } else skipped++;
  }
  log(`contrib: ${items.length} items from approved contributions${skipped ? `, ${skipped} skipped` : ""}`);
  return items;
}
